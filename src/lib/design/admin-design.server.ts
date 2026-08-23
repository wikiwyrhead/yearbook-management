/**
 * Hidden Super-Admin Design Provider — Administrative Server Functions
 * All functions strictly require active super_admin role and session-derived actor identity.
 */
import { query, getDbPool } from "../db/pool.server.ts";
import { openCredentials } from "../storage/credentials.server.ts";
import {
  generateCorrelationState,
  generateOAuthState,
  deriveCodeVerifier,
  codeChallengeS256,
} from "../storage/oauth-state.server.ts";
import { canvaProvider } from "./canva.provider.ts";
import type { DesignRef } from "./design-provider.ts";
import { getOAuthCallbackUrl } from "../app-url.ts";

export interface AuthenticatedActor {
  id: string;
  email: string;
  role?: string;
}

/**
 * Enforce that the actor currently holds super_admin role.
 */
export async function requireSuperAdmin(actor: AuthenticatedActor): Promise<void> {
  if (!actor || !actor.id) {
    throw new Error("Authentication required.");
  }

  const res = await query(
    `SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'super_admin'`,
    [actor.id],
  );

  if (res.rows.length === 0) {
    const err = new Error("Access denied. Super Administrator privileges required.");
    (err as any).statusCode = 403;
    throw err;
  }
}

/**
 * Retrieve the active Canva design provider platform connection (Super Admin only).
 */
export async function adminGetDesignProviderConnection(actor: AuthenticatedActor) {
  await requireSuperAdmin(actor);

  const res = await query(
    `SELECT id, provider, connected_by, external_user_id, external_team_id, display_name, scopes, is_active, status, connected_at, disconnected_at, created_at, updated_at 
     FROM public.design_provider_connections 
     WHERE provider = 'canva' AND is_active = true 
     LIMIT 1`,
  );

  if (res.rows.length === 0) {
    return { isConnected: false, connection: null };
  }

  const row = res.rows[0];
  return {
    isConnected: row.status === "connected",
    connection: {
      id: row.id,
      provider: row.provider,
      displayName: row.display_name,
      externalUserId: row.external_user_id,
      externalTeamId: row.external_team_id,
      scopes: row.scopes || [],
      status: row.status,
      connectedAt: row.connected_at,
      isActive: row.is_active,
    },
  };
}

/**
 * Decrypt the active platform Canva tokens from the database.
 */
export async function getActivePlatformCanvaCredentials(): Promise<{
  connectionId: string;
  ref: DesignRef;
}> {
  const res = await query(
    `SELECT id, encrypted_credentials FROM public.design_provider_connections 
     WHERE provider = 'canva' AND is_active = true AND status = 'connected' 
     LIMIT 1`,
  );

  if (res.rows.length === 0 || !res.rows[0].encrypted_credentials) {
    throw new Error("Design service is currently not configured or connected.");
  }

  const creds = res.rows[0].encrypted_credentials;
  const decrypted = openCredentials(creds);

  if (!decrypted.accessToken) {
    throw new Error("Design service credentials are missing or could not be decrypted.");
  }

  return {
    connectionId: res.rows[0].id,
    ref: {
      connectionId: res.rows[0].id,
      accessToken: decrypted.accessToken,
      refreshToken: decrypted.refreshToken,
    },
  };
}

/**
 * Start Canva OAuth connection flow (Super Admin only).
 */
export async function adminStartCanvaOAuth(actor: AuthenticatedActor, yearbookId?: string) {
  await requireSuperAdmin(actor);

  const state = generateOAuthState({
    provider: "canva",
    scope: "center",
    userId: actor.id,
    yearbookId: yearbookId || null,
  });

  const challenge = codeChallengeS256(deriveCodeVerifier(state));
  const redirectUri = (process.env["CANVA_REDIRECT_URI"] || "").trim() || getOAuthCallbackUrl();

  const url = new URL("https://www.canva.com/api/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env["CANVA_CLIENT_ID"] || "");
  url.searchParams.set(
    "scope",
    "profile:read asset:read asset:write design:meta:read design:content:read design:content:write",
  );
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("redirect_uri", redirectUri);

  return {
    authUrl: url.toString(),
    state,
  };
}

/**
 * Disconnect and revoke Canva design provider connection (Super Admin only).
 */
export async function adminDisconnectDesignProvider(actor: AuthenticatedActor) {
  await requireSuperAdmin(actor);

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE public.design_provider_connections 
       SET is_active = false, status = 'disconnected', disconnected_at = now(), encrypted_credentials = null, updated_at = now() 
       WHERE provider = 'canva' AND is_active = true`,
    );
    await client.query("COMMIT");
    return { success: true, message: "Design provider disconnected successfully." };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * List Canva designs using the platform connection (Super Admin only).
 */
export async function adminListExternalDesigns(actor: AuthenticatedActor, search?: string) {
  await requireSuperAdmin(actor);
  const { ref } = await getActivePlatformCanvaCredentials();

  const designs = await canvaProvider.listDesigns(ref, search);

  return {
    designs: designs.map((d) => ({
      id: d.id,
      title: d.title,
      pageCount: d.pageCount || 1,
      thumbnailUrl: d.thumbnailUrl,
      updatedAt: d.updatedAt,
    })),
  };
}

/**
 * Link a Canva design to a Yearbook (Super Admin only).
 * Resolves title & pageCount from Canva API on server and transactionally replaces existing active binding.
 */
export async function adminLinkYearbookDesign(
  actor: AuthenticatedActor,
  yearbookId: string,
  externalDesignId: string,
) {
  await requireSuperAdmin(actor);
  if (!yearbookId || !externalDesignId) {
    throw new Error("Yearbook ID and Design ID are required.");
  }

  const { connectionId, ref } = await getActivePlatformCanvaCredentials();

  // Verify design existence & resolve authentic title via Canva API
  const design = await canvaProvider.getDesign(ref, externalDesignId);

  if (!design || !design.id) {
    throw new Error("External design not found or inaccessible.");
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if design is active on another yearbook
    const otherYbCheck = await client.query(
      `SELECT yearbook_id FROM public.yearbook_design_bindings 
       WHERE external_design_id = $1 AND is_active = true AND yearbook_id != $2 FOR UPDATE`,
      [externalDesignId, yearbookId],
    );
    if (otherYbCheck.rowCount && otherYbCheck.rowCount > 0) {
      throw new Error("This layout design is currently actively bound to another Yearbook.");
    }

    // Deactivate previous active binding for this yearbook
    await client.query(
      `UPDATE public.yearbook_design_bindings 
       SET is_active = false, replaced_at = now(), replaced_by = $1, updated_at = now() 
       WHERE yearbook_id = $2 AND is_active = true`,
      [actor.id, yearbookId],
    );

    // Insert new active binding
    const insertRes = await client.query(
      `INSERT INTO public.yearbook_design_bindings (
        yearbook_id,
        provider_connection_id,
        external_design_id,
        external_design_title,
        assigned_by,
        assigned_at,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, now(), true) 
      RETURNING id, yearbook_id, external_design_id, external_design_title, is_active, assigned_at`,
      [yearbookId, connectionId, design.id, design.title || "Yearbook Layout", actor.id],
    );

    await client.query("COMMIT");

    return {
      binding: insertRes.rows[0],
      pageCount: design.pageCount || 1,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Replace a Yearbook's layout design (Super Admin only).
 */
export async function adminReplaceYearbookDesign(
  actor: AuthenticatedActor,
  yearbookId: string,
  newExternalDesignId: string,
) {
  return adminLinkYearbookDesign(actor, yearbookId, newExternalDesignId);
}

/**
 * Map external layout pages to a Milestone page (Super Admin only).
 */
export async function adminMapDesignPages(
  actor: AuthenticatedActor,
  yearbookId: string,
  pageId: string,
  externalPageNumbers: number[],
) {
  await requireSuperAdmin(actor);

  if (!externalPageNumbers || externalPageNumbers.length === 0) {
    throw new Error("At least one layout page number must be specified.");
  }

  // Validate positive, unique integers
  const seen = new Set<number>();
  for (const p of externalPageNumbers) {
    if (!Number.isInteger(p) || p <= 0) {
      throw new Error(
        `Invalid layout page number '${p}'. Layout page numbers must be positive integers (>= 1).`,
      );
    }
    if (seen.has(p)) {
      throw new Error(`Duplicate layout page number '${p}' is not allowed.`);
    }
    seen.add(p);
  }

  // Resolve active binding for this yearbook
  const bindingRes = await query(
    `SELECT id, external_design_id FROM public.yearbook_design_bindings 
     WHERE yearbook_id = $1 AND is_active = true LIMIT 1`,
    [yearbookId],
  );

  if (bindingRes.rows.length === 0) {
    throw new Error("No active layout design bound to this Yearbook.");
  }

  const binding = bindingRes.rows[0];
  const { ref } = await getActivePlatformCanvaCredentials();

  // Validate page numbers against live Canva design page count
  const design = await canvaProvider.getDesign(ref, binding.external_design_id);

  const maxPage = Math.max(...externalPageNumbers);
  if (design.pageCount && maxPage > design.pageCount) {
    throw new Error(
      `Layout page ${maxPage} exceeds the live design total page count (${design.pageCount}).`,
    );
  }

  // Upsert into yearbook_design_page_mappings
  const res = await query(
    `INSERT INTO public.yearbook_design_page_mappings (
      yearbook_id,
      binding_id,
      milestone_page_id,
      external_page_numbers,
      created_by,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, now()) 
    ON CONFLICT (binding_id, milestone_page_id) 
    DO UPDATE SET external_page_numbers = EXCLUDED.external_page_numbers, updated_at = now() 
    RETURNING id, binding_id, milestone_page_id, external_page_numbers`,
    [yearbookId, binding.id, pageId, externalPageNumbers, actor.id],
  );

  return {
    mapping: res.rows[0],
    designPageCount: design.pageCount,
  };
}

/**
 * Open external design in Canva editor with signed correlation state (Super Admin only).
 * Resolves active binding and design ID on server — does not trust browser-supplied design ID.
 */
export async function adminOpenExternalDesign(actor: AuthenticatedActor, yearbookId: string) {
  await requireSuperAdmin(actor);

  const bindingRes = await query(
    `SELECT id, external_design_id, external_design_title FROM public.yearbook_design_bindings 
     WHERE yearbook_id = $1 AND is_active = true LIMIT 1`,
    [yearbookId],
  );

  if (bindingRes.rows.length === 0) {
    throw new Error("No active layout design is bound to this Yearbook.");
  }

  const binding = bindingRes.rows[0];
  const { ref } = await getActivePlatformCanvaCredentials();

  const design = await canvaProvider.getDesign(ref, binding.external_design_id);

  if (!design || !design.url) {
    throw new Error("Could not generate edit URL for layout design.");
  }

  const correlationState = generateCorrelationState({
    userId: actor.id,
    yearbookId,
    designId: binding.external_design_id,
  });

  const separator = design.url.includes("?") ? "&" : "?";
  const urlWithState = `${design.url}${separator}state=${encodeURIComponent(correlationState)}`;

  return {
    editUrl: urlWithState,
    designTitle: binding.external_design_title,
    designId: binding.external_design_id,
  };
}

/**
 * Batch map all pages of a yearbook 1-to-1 to Canva pages (Super Admin only).
 * Pre-validates live Canva page count.
 */
export async function adminBatchMapSequentialPages(
  actor: AuthenticatedActor,
  yearbookId: string,
) {
  await requireSuperAdmin(actor);

  const bindingRes = await query(
    `SELECT id, external_design_id FROM public.yearbook_design_bindings 
     WHERE yearbook_id = $1 AND is_active = true LIMIT 1`,
    [yearbookId],
  );

  if (bindingRes.rows.length === 0) {
    throw new Error("No active layout design bound to this Yearbook.");
  }

  const binding = bindingRes.rows[0];
  const { ref } = await getActivePlatformCanvaCredentials();
  const design = await canvaProvider.getDesign(ref, binding.external_design_id);

  if (!design || !design.id) {
    throw new Error("Bound layout design not found in Canva.");
  }

  const pagesRes = await query(
    `SELECT id, physical_index FROM public.pages 
     WHERE yearbook_id = $1 
     ORDER BY physical_index ASC`,
    [yearbookId],
  );

  const totalMilestonePages = pagesRes.rows.length;
  const totalCanvaPages = design.pageCount || 1;

  if (totalCanvaPages < totalMilestonePages) {
    throw new Error(
      `Canva design has ${totalCanvaPages} pages, but Yearbook has ${totalMilestonePages} pages. Please ensure Canva layout matches total pages before batch mapping.`
    );
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    for (const page of pagesRes.rows) {
      const canvaPageNum = page.physical_index;
      await client.query(
        `INSERT INTO public.yearbook_design_page_mappings 
         (yearbook_id, binding_id, milestone_page_id, external_page_numbers, created_by, updated_at)
         VALUES ($1, $2, $3, ARRAY[$4]::int[], $5, now())
         ON CONFLICT (binding_id, milestone_page_id)
         DO UPDATE SET external_page_numbers = ARRAY[$4]::int[], updated_at = now()`,
        [yearbookId, binding.id, page.id, canvaPageNum, actor.id]
      );
    }

    await client.query("COMMIT;");
    return { mappedCount: totalMilestonePages };
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}
