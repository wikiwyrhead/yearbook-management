import { query } from "./pool.server.ts";
import { localStorageProvider } from "../storage/local.provider.ts";

function formatPgParam(col: string, val: any): any {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val;
  if (Buffer.isBuffer(val)) return val;
  if (col === "scopes") {
    return Array.isArray(val) ? val : [val];
  }
  if (Array.isArray(val)) {
    return JSON.stringify(val);
  }
  if (typeof val === "object") {
    // JSONB / JSON columns
    return JSON.stringify(val);
  }
  return val;
}

export class PgQueryBuilder<T = any> {
  private tableName: string;
  private rawTable: string;
  private selectFields: string = "*";
  private whereClauses: { col: string; op: string; val: any }[] = [];
  private orderClause: string = "";
  private limitCount?: number | undefined;
  private offsetCount?: number | undefined;
  private isSingle: boolean = false;
  private isMaybeSingle: boolean = false;
  private isCount: boolean = false;
  private countType: "exact" | "planned" | "estimated" = "exact";
  private isHead: boolean = false;

  private insertData?: Record<string, any> | Record<string, any>[] | undefined;
  private updateData?: Record<string, any> | undefined;
  private isDelete: boolean = false;
  private isUpsert: boolean = false;
  private upsertOnConflict?: string | undefined;

  constructor(table: string) {
    this.rawTable = table.replace(/^public\./, "");
    this.tableName = `public.${this.rawTable}`;
  }

  select(
    fields: string = "*",
    options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ) {
    this.selectFields = fields;
    if (options?.count) {
      this.isCount = true;
      this.countType = options.count;
    }
    if (options?.head) {
      this.isHead = true;
    }
    return this;
  }

  insert(data: Record<string, any> | Record<string, any>[]) {
    this.insertData = data;
    return this;
  }

  upsert(data: Record<string, any> | Record<string, any>[], options?: { onConflict?: string }) {
    this.insertData = data;
    this.isUpsert = true;
    this.upsertOnConflict = options?.onConflict;
    return this;
  }

  update(data: Record<string, any>) {
    this.updateData = data;
    return this;
  }

  delete() {
    this.isDelete = true;
    return this;
  }

  eq(col: string, val: any) {
    this.whereClauses.push({ col, op: "=", val });
    return this;
  }

  neq(col: string, val: any) {
    this.whereClauses.push({ col, op: "!=", val });
    return this;
  }

  in(col: string, vals: any[]) {
    this.whereClauses.push({ col, op: "IN", val: vals });
    return this;
  }

  gte(col: string, val: any) {
    this.whereClauses.push({ col, op: ">=", val });
    return this;
  }

  lte(col: string, val: any) {
    this.whereClauses.push({ col, op: "<=", val });
    return this;
  }

  gt(col: string, val: any) {
    this.whereClauses.push({ col, op: ">", val });
    return this;
  }

  lt(col: string, val: any) {
    this.whereClauses.push({ col, op: "<", val });
    return this;
  }

  like(col: string, val: any) {
    this.whereClauses.push({ col, op: "LIKE", val });
    return this;
  }

  ilike(col: string, val: any) {
    this.whereClauses.push({ col, op: "ILIKE", val });
    return this;
  }

  is(col: string, val: any) {
    if (val === null) {
      this.whereClauses.push({ col, op: "IS NULL", val: null });
    } else {
      this.whereClauses.push({ col, op: "IS", val });
    }
    return this;
  }

  not(col: string, op: string, val: any) {
    const normOp = op.toLowerCase().trim();
    if (normOp === "is" && val === null) {
      this.whereClauses.push({ col, op: "IS NOT NULL", val: null });
    } else if (normOp === "in") {
      this.whereClauses.push({ col, op: "NOT IN", val });
    } else {
      this.whereClauses.push({ col, op: `NOT ${op}`, val });
    }
    return this;
  }

  order(col: string, options?: { ascending?: boolean }) {
    const dir = options?.ascending === false ? "DESC" : "ASC";
    this.orderClause = `ORDER BY ${col} ${dir}`;
    return this;
  }

  range(from: number, to: number) {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    this.limitCount = 1;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    this.limitCount = 1;
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: any;
          error: any;
          count?: number | null | undefined;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private buildSelectProjection(): string {
    const raw = this.selectFields.trim();
    if (raw === "*" || !raw.includes("(")) {
      return `${this.tableName}.*`;
    }

    const projections: string[] = [`${this.tableName}.*`];

    // 1. Yearbooks -> schools relation
    if (this.rawTable === "yearbooks" && (raw.includes("schools(") || raw.includes("schools(*)"))) {
      projections.push(`(
        SELECT json_build_object(
          'id', s.id,
          'name', s.name,
          'short_name', s.short_name,
          'logo_url', s.logo_url
        ) FROM public.schools s WHERE s.id = ${this.tableName}.school_id
      ) as schools`);
    }

    // 2. Students -> yearbooks & schools relation
    if (this.rawTable === "students" && raw.includes("yearbooks(")) {
      projections.push(`(
        SELECT json_build_object(
          'id', y.id,
          'year', y.year,
          'title', y.title,
          'schools', (SELECT json_build_object('name', s.name) FROM public.schools s WHERE s.id = y.school_id)
        ) FROM public.yearbooks y WHERE y.id = ${this.tableName}.yearbook_id
      ) as yearbooks`);
    }

    // 3. Yearbook Members -> profiles relation
    if (this.rawTable === "yearbook_members" && raw.includes("profiles(")) {
      projections.push(`(
        SELECT json_build_object(
          'id', pr.id,
          'email', pr.email,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url
        ) FROM public.profiles pr WHERE pr.id = ${this.tableName}.user_id
      ) as profiles`);
    }

    // 4. Assets -> uploaded_by_profile, student, pages relation
    if (this.rawTable === "assets") {
      if (raw.includes("uploaded_by_profile:") || raw.includes("profiles!")) {
        projections.push(`(
          SELECT json_build_object(
            'full_name', pr.full_name,
            'email', pr.email
          ) FROM public.profiles pr WHERE pr.id = ${this.tableName}.uploaded_by
        ) as uploaded_by_profile`);
      }
      if (raw.includes("student:") || raw.includes("students(")) {
        projections.push(`(
          SELECT json_build_object(
            'first_name', st.first_name,
            'last_name', st.last_name
          ) FROM public.students st WHERE st.id = ${this.tableName}.student_id
        ) as student`);
      }
      if (raw.includes("pages:") || raw.includes("page_assets(")) {
        projections.push(`COALESCE((
          SELECT json_agg(
            json_build_object(
              'page', (SELECT json_build_object('id', p.id, 'page_number', p.page_number, 'title', p.title) FROM public.pages p WHERE p.id = pa.page_id)
            )
          ) FROM public.page_assets pa WHERE pa.asset_id = ${this.tableName}.id
        ), '[]'::json) as pages`);
      }
    }

    // 5. Asset Audit Log -> performed_by_profile
    if (
      this.rawTable === "asset_audit_log" &&
      (raw.includes("performed_by_profile:") || raw.includes("profiles!"))
    ) {
      projections.push(`(
        SELECT json_build_object(
          'full_name', pr.full_name
        ) FROM public.profiles pr WHERE pr.id = ${this.tableName}.performed_by
      ) as performed_by_profile`);
    }

    // 6. Pages -> page_assignments relation
    if (this.rawTable === "pages" && raw.includes("page_assignments(")) {
      projections.push(`COALESCE((
        SELECT json_agg(
          json_build_object(
            'id', pa.id,
            'user_id', pa.user_id,
            'kind', pa.kind
          )
        ) FROM public.page_assignments pa WHERE pa.page_id = ${this.tableName}.id
      ), '[]'::json) as page_assignments`);
    }

    // 7. Proofs -> corrections relation and created_by_profile join
    if (this.rawTable === "proofs") {
      if (raw.includes("corrections(")) {
        projections.push(`COALESCE((
          SELECT json_agg(
            json_build_object(
              'id', c.id,
              'page_number', c.page_number,
              'title', c.title,
              'description', c.description,
              'coordinates', c.coordinates,
              'status', c.status
            )
          ) FROM public.corrections c WHERE c.proof_id = ${this.tableName}.id
        ), '[]'::json) as corrections`);
      }
      if (raw.includes("created_by_profile:") || raw.includes("profiles!proofs_created_by_fkey")) {
        projections.push(`(
          SELECT json_build_object('full_name', pr.full_name)
          FROM public.profiles pr WHERE pr.id = ${this.tableName}.created_by
        ) as created_by_profile`);
      }
      if (raw.includes("pages:") || raw.includes("proof_pages(")) {
        projections.push(`COALESCE((
          SELECT json_agg(json_build_object('page_id', pp.page_id))
          FROM public.proof_pages pp WHERE pp.proof_id = ${this.tableName}.id
        ), '[]'::json) as pages`);
      }
    }

    // 8. Corrections -> multiple profile joins and correction_comments
    if (this.rawTable === "corrections") {
      if (raw.includes("created_by_profile:")) {
        projections.push(`(
          SELECT json_build_object('full_name', pr.full_name)
          FROM public.profiles pr WHERE pr.id = ${this.tableName}.created_by
        ) as created_by_profile`);
      }
      if (raw.includes("assigned_to_profile:")) {
        projections.push(`(
          SELECT json_build_object('full_name', pr.full_name)
          FROM public.profiles pr WHERE pr.id = ${this.tableName}.assigned_to
        ) as assigned_to_profile`);
      }
      if (raw.includes("resolved_by_profile:")) {
        projections.push(`(
          SELECT json_build_object('full_name', pr.full_name)
          FROM public.profiles pr WHERE pr.id = ${this.tableName}.resolved_by
        ) as resolved_by_profile`);
      }
      if (raw.includes("verified_by_profile:")) {
        projections.push(`(
          SELECT json_build_object('full_name', pr.full_name)
          FROM public.profiles pr WHERE pr.id = ${this.tableName}.verified_by
        ) as verified_by_profile`);
      }
      if (raw.includes("comments:") || raw.includes("correction_comments(")) {
        projections.push(`COALESCE((
          SELECT json_agg(
            json_build_object(
              'id', cc.id,
              'correction_id', cc.correction_id,
              'user_id', cc.user_id,
              'content', cc.content,
              'created_at', cc.created_at,
              'user_profile', (
                SELECT json_build_object('full_name', pr.full_name)
                FROM public.profiles pr WHERE pr.id = cc.user_id
              )
            )
          ) FROM public.correction_comments cc WHERE cc.correction_id = ${this.tableName}.id
        ), '[]'::json) as comments`);
      }
    }

    // 9. Yearbook invitations -> invited_by_profile
    if (
      this.rawTable === "yearbook_invitations" &&
      (raw.includes("invited_by_profile:") ||
        raw.includes("profiles!yearbook_invitations_invited_by_fkey"))
    ) {
      projections.push(`(
        SELECT json_build_object('full_name', pr.full_name)
        FROM public.profiles pr WHERE pr.id = ${this.tableName}.invited_by
      ) as invited_by_profile`);
    }

    // 10. Service bureau submissions -> service_bureaus join
    if (this.rawTable === "service_bureau_submissions" && raw.includes("service_bureaus(")) {
      projections.push(`(
        SELECT json_build_object(
          'id', sb.id,
          'name', sb.name,
          'code', sb.code,
          'contact_email', sb.contact_email
        ) FROM public.service_bureaus sb WHERE sb.id = ${this.tableName}.service_bureau_id
      ) as service_bureaus`);
    }

    // 11. Yearbook team assignments -> profiles, assigned_by_profile, center_membership, assigned_pages, assigned_sections
    if (this.rawTable === "yearbook_team_assignments") {
      if (raw.includes("profiles(") || raw.includes("profile:")) {
        projections.push(`(
          SELECT json_build_object(
            'id', pr.id,
            'email', pr.email,
            'full_name', pr.full_name,
            'avatar_url', pr.avatar_url
          ) FROM public.profiles pr WHERE pr.id = ${this.tableName}.user_id
        ) as profile`);
      }
      if (raw.includes("assigned_by_profile:")) {
        projections.push(`(
          SELECT json_build_object('full_name', pr.full_name, 'email', pr.email)
          FROM public.profiles pr WHERE pr.id = ${this.tableName}.assigned_by
        ) as assigned_by_profile`);
      }
      if (raw.includes("center_membership:") || raw.includes("center_memberships(")) {
        projections.push(`(
          SELECT json_build_object(
            'id', cm.id,
            'member_type', cm.member_type,
            'is_active', cm.is_active
          ) FROM public.center_memberships cm WHERE cm.id = ${this.tableName}.center_membership_id
        ) as center_membership`);
      }
      if (raw.includes("assigned_pages:") || raw.includes("yearbook_assignment_pages(")) {
        projections.push(`COALESCE((
          SELECT json_agg(
            json_build_object(
              'page_id', ap.page_id,
              'page_number', p.page_number,
              'title', p.title
            )
          ) FROM public.yearbook_assignment_pages ap
          JOIN public.pages p ON p.id = ap.page_id
          WHERE ap.assignment_id = ${this.tableName}.id
        ), '[]'::json) as assigned_pages`);
      }
      if (raw.includes("assigned_sections:") || raw.includes("yearbook_assignment_sections(")) {
        projections.push(`COALESCE((
          SELECT json_agg(
            json_build_object(
              'section_id', asec.section_id,
              'name', s.name,
              'color', s.color
            )
          ) FROM public.yearbook_assignment_sections asec
          JOIN public.sections s ON s.id = asec.section_id
          WHERE asec.assignment_id = ${this.tableName}.id
        ), '[]'::json) as assigned_sections`);
      }
    }

    // 12. Center memberships -> profiles, assigned_by_profile
    if (this.rawTable === "center_memberships") {
      if (raw.includes("profiles(") || raw.includes("profile:")) {
        projections.push(`(
          SELECT json_build_object(
            'id', pr.id,
            'email', pr.email,
            'full_name', pr.full_name,
            'avatar_url', pr.avatar_url
          ) FROM public.profiles pr WHERE pr.id = ${this.tableName}.user_id
        ) as profile`);
      }
      if (raw.includes("assigned_by_profile:")) {
        projections.push(`(
          SELECT json_build_object('full_name', pr.full_name, 'email', pr.email)
          FROM public.profiles pr WHERE pr.id = ${this.tableName}.assigned_by
        ) as assigned_by_profile`);
      }
    }

    // 13. Center role appointments -> profiles, assigned_by_profile
    if (this.rawTable === "center_role_appointments") {
      if (raw.includes("profiles(") || raw.includes("profile:")) {
        projections.push(`(
          SELECT json_build_object(
            'id', pr.id,
            'email', pr.email,
            'full_name', pr.full_name,
            'avatar_url', pr.avatar_url
          ) FROM public.profiles pr WHERE pr.id = ${this.tableName}.user_id
        ) as profile`);
      }
      if (raw.includes("assigned_by_profile:")) {
        projections.push(`(
          SELECT json_build_object('full_name', pr.full_name, 'email', pr.email)
          FROM public.profiles pr WHERE pr.id = ${this.tableName}.assigned_by
        ) as assigned_by_profile`);
      }
    }

    return projections.join(", ");
  }

  private buildWhereSql(params: any[]): string {
    if (this.whereClauses.length === 0) return "";
    return (
      "WHERE " +
      this.whereClauses
        .map((c) => {
          if (c.op === "IN") {
            params.push(c.val);
            return `${this.tableName}.${c.col} = ANY($${params.length})`;
          }
          if (c.op === "NOT IN") {
            params.push(c.val);
            return `NOT (${this.tableName}.${c.col} = ANY($${params.length}))`;
          }
          if (c.op === "IS NULL") {
            return `${this.tableName}.${c.col} IS NULL`;
          }
          if (c.op === "IS NOT NULL") {
            return `${this.tableName}.${c.col} IS NOT NULL`;
          }
          if (c.op.startsWith("NOT ")) {
            const rawOp = c.op.replace(/^NOT\s+/, "").trim();
            params.push(c.val);
            return `NOT (${this.tableName}.${c.col} ${rawOp} $${params.length})`;
          }
          params.push(c.val);
          return `${this.tableName}.${c.col} ${c.op} $${params.length}`;
        })
        .join(" AND ")
    );
  }

  private async execute(): Promise<{ data: any; error: any; count?: number | null | undefined }> {
    try {
      const params: any[] = [];
      let sql = "";

      // 1. COUNT ONLY (HEAD)
      if (this.isHead && this.isCount) {
        const whereSql = this.buildWhereSql(params);
        const res = await query(
          `SELECT COUNT(*)::int as count FROM ${this.tableName} ${whereSql}`,
          params,
        );
        return { data: null, error: null, count: res.rows[0]?.count ?? 0 };
      }

      // 2. INSERT / UPSERT
      if (this.insertData) {
        const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
        if (rows.length === 0) return { data: [], error: null };

        const cols = Object.keys(rows[0]);
        const valuesClauses: string[] = [];

        for (const row of rows) {
          const rowParams: string[] = [];
          for (const col of cols) {
            params.push(formatPgParam(col, row[col]));
            rowParams.push(`$${params.length}`);
          }
          valuesClauses.push(`(${rowParams.join(", ")})`);
        }

        sql = `INSERT INTO ${this.tableName} (${cols.join(", ")}) VALUES ${valuesClauses.join(", ")}`;

        if (this.isUpsert) {
          let defaultConflict = cols[0];
          if (this.rawTable === "center_storage_connections")
            defaultConflict = "center_id, provider";
          else if (this.rawTable === "yearbook_storage_config") defaultConflict = "yearbook_id";
          else if (this.rawTable === "organization_storage_connections")
            defaultConflict = "provider";
          else if (this.rawTable === "member_storage_connections")
            defaultConflict = "user_id, provider";
          else if (this.rawTable === "canva_user_connections") defaultConflict = "user_id";
          else if (this.rawTable === "canva_designs")
            defaultConflict = "yearbook_id, canva_design_id";

          const conflictStr = this.upsertOnConflict || defaultConflict || "id";
          const conflictCols = conflictStr.split(",").map((s) => s.trim());
          const updateSet = cols
            .filter((c) => !conflictCols.includes(c) && c !== "id")
            .map((c) => `${c} = EXCLUDED.${c}`)
            .join(", ");
          if (updateSet) {
            sql += ` ON CONFLICT (${conflictStr}) DO UPDATE SET ${updateSet}`;
          } else {
            sql += ` ON CONFLICT DO NOTHING`;
          }
        }

        sql += ` RETURNING *`;
        const res = await query(sql, params);
        const data =
          this.isSingle || (!Array.isArray(this.insertData) && !this.isMaybeSingle)
            ? res.rows[0]
            : res.rows;
        return { data, error: null };
      }

      // 3. UPDATE
      if (this.updateData) {
        const cols = Object.keys(this.updateData);
        const setClauses: string[] = [];
        for (const col of cols) {
          params.push(formatPgParam(col, this.updateData[col]));
          setClauses.push(`${col} = $${params.length}`);
        }

        const whereSql = this.buildWhereSql(params);
        sql = `UPDATE ${this.tableName} SET ${setClauses.join(", ")} ${whereSql} RETURNING *`;
        const res = await query(sql, params);
        const data = this.isSingle ? res.rows[0] : res.rows;
        return { data, error: null };
      }

      // 4. DELETE
      if (this.isDelete) {
        const whereSql = this.buildWhereSql(params);
        sql = `DELETE FROM ${this.tableName} ${whereSql} RETURNING *`;
        const res = await query(sql, params);
        return { data: res.rows, error: null };
      }

      // 5. SELECT
      const whereSql = this.buildWhereSql(params);
      let limitSql = "";
      if (this.limitCount !== undefined) {
        limitSql = `LIMIT ${this.limitCount}`;
      }
      if (this.offsetCount !== undefined) {
        limitSql += ` OFFSET ${this.offsetCount}`;
      }

      const projection = this.buildSelectProjection();
      sql =
        `SELECT ${projection} FROM ${this.tableName} ${whereSql} ${this.orderClause} ${limitSql}`.trim();
      const res = await query(sql, params);

      let data: any = res.rows;
      if (this.isSingle) {
        if (res.rows.length === 0) {
          return {
            data: null,
            error: {
              message: "JSON object requested, multiple (or no) rows returned",
              code: "PGRST116",
            },
          };
        }
        data = res.rows[0];
      } else if (this.isMaybeSingle) {
        data = res.rows.length > 0 ? res.rows[0] : null;
      }

      return { data, error: null, count: this.isCount ? res.rows.length : undefined };
    } catch (err: any) {
      console.error(`[PgQueryBuilder Error on ${this.tableName}]:`, err);
      return { data: null, error: { message: err.message, code: err.code || "DB_ERROR" } };
    }
  }
}

export class LocalPgClient {
  from(table: string) {
    return new PgQueryBuilder(table);
  }

  async rpc(fn: string, args: Record<string, any> = {}): Promise<{ data: any; error: any }> {
    try {
      const keys = Object.keys(args);
      const params = keys.map((k) => args[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      const res = await query(`SELECT public.${fn}(${placeholders}) as result`, params);
      return { data: res.rows[0]?.result ?? null, error: null };
    } catch (err: any) {
      console.error(`[LocalPgClient RPC Error on ${fn}]:`, err);
      return { data: null, error: { message: err.message } };
    }
  }

  get storage() {
    return {
      from: (bucket: string) => ({
        upload: async (filePath: string, data: any, options?: any) => {
          const res = await localStorageProvider.upload(
            bucket,
            filePath,
            data,
            options?.contentType,
          );
          return { data: res, error: null };
        },
        download: async (filePath: string) => {
          try {
            const buf = await localStorageProvider.download(bucket, filePath);
            return { data: buf, error: null };
          } catch (err: any) {
            return { data: null, error: err };
          }
        },
        getPublicUrl: (filePath: string) => {
          return { data: { publicUrl: localStorageProvider.getUrl(bucket, filePath) } };
        },
        createSignedUrl: async (filePath: string, _expiry: number) => {
          return {
            data: { signedUrl: localStorageProvider.getUrl(bucket, filePath) },
            error: null,
          };
        },
        remove: async (paths: string[]) => {
          await localStorageProvider.delete(bucket, paths);
          return { data: paths, error: null };
        },
      }),
    };
  }
}

export const localPgClient = new LocalPgClient();
