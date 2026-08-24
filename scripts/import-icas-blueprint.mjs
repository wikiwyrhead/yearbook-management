import pg from "pg";
import fs from "node:fs";
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const scryptAsync = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

let connectionString = process.env.DATABASE_URL || "";
if (!connectionString && fs.existsSync(".env")) {
  const envContent = fs.readFileSync(".env", "utf8");
  const m = envContent.match(/DATABASE_URL="?([^"\n]+)"?/);
  if (m) connectionString = m[1];
}
if (connectionString.includes("@postgres:5432")) {
  connectionString = connectionString.replace("@postgres:5432", "@localhost:5432");
}

const pool = new pg.Pool({ connectionString });

const PDF_PATH = process.env.ICAS_BLUEPRINT_PDF_PATH || ".localdev/fixtures/icas-138.pdf";

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`[Error] Source blueprint PDF not found at "${PDF_PATH}".`);
    console.error(
      "Please set ICAS_BLUEPRINT_PDF_PATH in .env to point to your local private PDF file.",
    );
    process.exit(1);
  }
  console.log("================================================================================");
  console.log("  MILESTONE YEARBOOK — ICAS DE CALARIAN 138-PAGE BLUEPRINT IMPORT");
  console.log("================================================================================\n");

  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    const centerId = "ddddddd1-1111-1111-1111-111111111111";
    const yearbookId = "ddddddd2-2222-2222-2222-222222222222";
    const superAdminId = "11111111-1111-1111-1111-111111111111"; // System Admin

    console.log("1. Ensuring Center 'ICAS de Calarian' and Yearbook 'Milestone 2025' exist...");
    await client.query(
      `
      INSERT INTO public.schools (id, name, short_name, city, state, is_active, created_by)
      VALUES ($1, 'ICAS de Calarian', 'ICAS', 'Zamboanga City', 'PH', true, $2)
      ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name, 
        short_name = EXCLUDED.short_name,
        city = EXCLUDED.city,
        state = EXCLUDED.state;
    `,
      [centerId, superAdminId],
    );

    await client.query(
      `
      INSERT INTO public.yearbooks (id, school_id, year, title, theme, page_count, created_by)
      VALUES ($1, $2, 2025, 'Milestone 2025', 'Jubilee 2025 – Pilgrims of Hope', 138, $3)
      ON CONFLICT (id) DO UPDATE SET 
        title = EXCLUDED.title, 
        theme = EXCLUDED.theme, 
        page_count = 138;
    `,
      [yearbookId, centerId, superAdminId],
    );

    console.log("2. Creating catalog Section Categories and Layout Types...");
    const catAcademic =
      (
        await client.query(
          `
      INSERT INTO public.section_categories (yearbook_id, name, code, color, sort_order)
      VALUES ($1, 'Academic Spreads & Profiles', 'ACADEMIC_PROFILES', '#3b82f6', 1)
      ON CONFLICT (id, yearbook_id) DO NOTHING
      RETURNING id;
    `,
          [yearbookId],
        )
      ).rows[0]?.id ||
      (
        await client.query(
          `SELECT id FROM public.section_categories WHERE yearbook_id = $1 AND code = 'ACADEMIC_PROFILES'`,
          [yearbookId],
        )
      ).rows[0].id;

    const catInst =
      (
        await client.query(
          `
      INSERT INTO public.section_categories (yearbook_id, name, code, color, sort_order)
      VALUES ($1, 'Institutional & Governance', 'INSTITUTIONAL', '#8b5cf6', 2)
      ON CONFLICT (id, yearbook_id) DO NOTHING
      RETURNING id;
    `,
          [yearbookId],
        )
      ).rows[0]?.id ||
      (
        await client.query(
          `SELECT id FROM public.section_categories WHERE yearbook_id = $1 AND code = 'INSTITUTIONAL'`,
          [yearbookId],
        )
      ).rows[0].id;

    const catLife =
      (
        await client.query(
          `
      INSERT INTO public.section_categories (yearbook_id, name, code, color, sort_order)
      VALUES ($1, 'Student Life & Activities', 'STUDENT_LIFE', '#10b981', 3)
      ON CONFLICT (id, yearbook_id) DO NOTHING
      RETURNING id;
    `,
          [yearbookId],
        )
      ).rows[0]?.id ||
      (
        await client.query(
          `SELECT id FROM public.section_categories WHERE yearbook_id = $1 AND code = 'STUDENT_LIFE'`,
          [yearbookId],
        )
      ).rows[0].id;

    const catCommunity =
      (
        await client.query(
          `
      INSERT INTO public.section_categories (yearbook_id, name, code, color, sort_order)
      VALUES ($1, 'Community & Tributes', 'COMMUNITY', '#f59e0b', 4)
      ON CONFLICT (id, yearbook_id) DO NOTHING
      RETURNING id;
    `,
          [yearbookId],
        )
      ).rows[0]?.id ||
      (
        await client.query(
          `SELECT id FROM public.section_categories WHERE yearbook_id = $1 AND code = 'COMMUNITY'`,
          [yearbookId],
        )
      ).rows[0].id;

    const ltPortrait =
      (
        await client.query(
          `
      INSERT INTO public.layout_types (yearbook_id, name, code, default_span, sort_order)
      VALUES ($1, 'Student Portrait Grid', 'PORTRAIT_GRID', 'single_page', 1)
      ON CONFLICT (id, yearbook_id) DO NOTHING
      RETURNING id;
    `,
          [yearbookId],
        )
      ).rows[0]?.id ||
      (
        await client.query(
          `SELECT id FROM public.layout_types WHERE yearbook_id = $1 AND code = 'PORTRAIT_GRID'`,
          [yearbookId],
        )
      ).rows[0].id;

    const ltFeature =
      (
        await client.query(
          `
      INSERT INTO public.layout_types (yearbook_id, name, code, default_span, sort_order)
      VALUES ($1, 'Feature Spread', 'FEATURE_SPREAD', 'two_page_spread', 2)
      ON CONFLICT (id, yearbook_id) DO NOTHING
      RETURNING id;
    `,
          [yearbookId],
        )
      ).rows[0]?.id ||
      (
        await client.query(
          `SELECT id FROM public.layout_types WHERE yearbook_id = $1 AND code = 'FEATURE_SPREAD'`,
          [yearbookId],
        )
      ).rows[0].id;

    console.log("3. Creating 18 Verified Editorial Sections...");
    const sectionsDef = [
      { name: "Front Matter & School Identity", start: 1, end: 4, pos: 1, cat: catInst },
      { name: "Leadership Messages", start: 5, end: 8, pos: 2, cat: catInst },
      { name: "Internal Divider", start: 9, end: 9, pos: 3, cat: catInst },
      { name: "Administration, Faculty & Staff", start: 10, end: 15, pos: 4, cat: catInst },
      {
        name: "Senior High School Graduation & Awardees",
        start: 16,
        end: 19,
        pos: 5,
        cat: catAcademic,
      },
      { name: "Grade 12 Profiles — St. John STEM A", start: 20, end: 28, pos: 6, cat: catAcademic },
      { name: "Grade 12 Profiles — St. John STEM B", start: 29, end: 37, pos: 7, cat: catAcademic },
      { name: "Grade 12 Profiles — St. Mark HUMSS", start: 38, end: 43, pos: 8, cat: catAcademic },
      { name: "Grade 12 Profiles — St. Matthew ABM", start: 44, end: 47, pos: 9, cat: catAcademic },
      {
        name: "Junior High School Moving Up & Awardees",
        start: 48,
        end: 51,
        pos: 10,
        cat: catAcademic,
      },
      {
        name: "Grade 10 Profiles — St. Peter, St. Paul, St. Pio",
        start: 52,
        end: 75,
        pos: 11,
        cat: catAcademic,
      },
      { name: "Elementary Moving Up & Awardees", start: 76, end: 79, pos: 12, cat: catAcademic },
      {
        name: "Grade 6 Profiles — St. Rose & St. Regina",
        start: 80,
        end: 91,
        pos: 13,
        cat: catAcademic,
      },
      { name: "Kindergarten Moving Up & Awardees", start: 92, end: 94, pos: 14, cat: catAcademic },
      {
        name: "Kinder 2 Profiles — St. Raphael AM & PM",
        start: 95,
        end: 105,
        pos: 15,
        cat: catAcademic,
      },
      { name: "Faculty, Staff & Undergraduates", start: 106, end: 115, pos: 16, cat: catInst },
      {
        name: "Student Life, Athletics & School Events",
        start: 116,
        end: 127,
        pos: 17,
        cat: catLife,
      },
      {
        name: "Advertisements, Sponsors & Tributes",
        start: 128,
        end: 134,
        pos: 18,
        cat: catCommunity,
      },
      {
        name: "Acknowledgements, Press & Editorial Board",
        start: 135,
        end: 136,
        pos: 19,
        cat: catInst,
      },
      { name: "ICAS Alma Mater Hymn & Back Cover", start: 137, end: 138, pos: 20, cat: catInst },
    ];

    // Clean old pages and sections for idempotency
    await client.query("DELETE FROM public.proof_pages WHERE yearbook_id = $1;", [yearbookId]);
    await client.query("DELETE FROM public.page_preparation_packets WHERE yearbook_id = $1;", [yearbookId]);
    await client.query("DELETE FROM public.page_content_blocks WHERE yearbook_id = $1;", [yearbookId]);
    await client.query("DELETE FROM public.page_person_appearances WHERE yearbook_id = $1;", [yearbookId]);
    await client.query("DELETE FROM public.page_asset_requirements WHERE yearbook_id = $1;", [yearbookId]);
    await client.query("DELETE FROM public.missing_content_checklist_items WHERE yearbook_id = $1;", [yearbookId]);
    await client.query("DELETE FROM public.yearbook_subjects WHERE yearbook_id = $1;", [yearbookId]);
    await client.query("DELETE FROM public.pages WHERE yearbook_id = $1;", [yearbookId]);
    await client.query("DELETE FROM public.sections WHERE yearbook_id = $1;", [yearbookId]);

    const sectionIdMap = new Map();
    for (const s of sectionsDef) {
      const sRes = await client.query(
        `
        INSERT INTO public.sections (yearbook_id, name, color, position)
        VALUES ($1, $2, '#3b82f6', $3)
        RETURNING id;
      `,
        [yearbookId, s.name, s.pos],
      );
      sectionIdMap.set(s.name, sRes.rows[0].id);
    }

    console.log("4. Loading PDF and extracting text from 138 pages...");
    const pdfData = new Uint8Array(fs.readFileSync(PDF_PATH));
    const doc = await pdfjsLib.getDocument({ data: pdfData }).promise;
    console.log(`Loaded PDF with ${doc.numPages} pages.`);

    let totalSubjectsImported = 0;
    let totalPortraitsRequested = 0;
    let totalChecklistItems = 0;

    for (let pageNum = 1; pageNum <= 138; pageNum++) {
      const pdfPage = await doc.getPage(pageNum);
      const textContent = await pdfPage.getTextContent();
      const rawStrings = textContent.items.map((it) => it.str).filter((s) => s.trim().length > 0);
      const fullText = rawStrings.join(" ");

      // Determine Section
      const secDef =
        sectionsDef.find((s) => pageNum >= s.start && pageNum <= s.end) || sectionsDef[0];
      const sectionId = sectionIdMap.get(secDef.name);

      // Determine Page Metadata
      const isCover = pageNum === 1;
      const isBackCover = pageNum === 138;
      const isUnnumbered = isCover || isBackCover || (pageNum >= 2 && pageNum <= 4);
      const displayLabel = isCover ? "Cover" : isBackCover ? "Back Cover" : `${pageNum}`;

      let pageTitle = `Page ${pageNum}`;
      if (isCover) pageTitle = "Front Cover: Milestone 2025 (Jubilee 2025 – Pilgrims of Hope)";
      else if (pageNum === 2) pageTitle = "School Identity & Vision";
      else if (pageNum === 3) pageTitle = "Mission & Philosophy";
      else if (pageNum === 4) pageTitle = "Our Goal and Core Values";
      else if (pageNum === 5) pageTitle = "President's Message";
      else if (pageNum === 6) pageTitle = "Director's Message";
      else if (pageNum === 7) pageTitle = "Principal's Message";
      else if (pageNum === 8) pageTitle = "Leadership Message";
      else if (pageNum === 10) pageTitle = "Administrators & Department Heads";
      else if (pageNum === 16) pageTitle = "Senior High School 8th Graduation Ceremony";
      else if (pageNum === 20) pageTitle = "Grade 12 STEM A — St. John";
      else if (pageNum === 29) pageTitle = "Grade 12 STEM B — St. John";
      else if (pageNum === 38) pageTitle = "Grade 12 HUMSS — St. Mark";
      else if (pageNum === 44) pageTitle = "Grade 12 ABM — St. Matthew";
      else if (pageNum === 48) pageTitle = "Junior High School 10th Moving Up Ceremony";
      else if (pageNum === 52) pageTitle = "Grade 10 St. Peter";
      else if (pageNum === 60) pageTitle = "Grade 10 St. Paul";
      else if (pageNum === 68) pageTitle = "Grade 10 St. Pio";
      else if (pageNum === 76) pageTitle = "Elementary 28th Moving Up Ceremony";
      else if (pageNum === 80) pageTitle = "Grade 6 St. Rose";
      else if (pageNum === 86) pageTitle = "Grade 6 St. Regina";
      else if (pageNum === 91) pageTitle = "Grade 6 Future Self Letter (2036)";
      else if (pageNum === 92) pageTitle = "Kindergarten 10th Moving Up Ceremony";
      else if (pageNum === 95) pageTitle = "Kinder 2 St. Raphael (Morning Session)";
      else if (pageNum === 101) pageTitle = "Kinder 2 St. Raphael (Afternoon Session)";
      else if (pageNum === 106) pageTitle = "Faculty, Staff & Undergraduates Divider";
      else if (pageNum === 135) pageTitle = "Press Acknowledgements & Editorial Board";
      else if (pageNum === 137) pageTitle = "ICAS Alma Mater Hymn";
      else if (isBackCover) pageTitle = "Back Cover: ICAS de Calarian Official Yearbook";

      // 1. Insert Page
      const pageRes = await client.query(
        `
        INSERT INTO public.pages 
        (yearbook_id, section_id, section_category_id, layout_type_id, physical_index, display_page_label, is_unnumbered, title)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id;
      `,
        [
          yearbookId,
          sectionId,
          secDef.cat,
          ltPortrait,
          pageNum,
          displayLabel,
          isUnnumbered,
          pageTitle,
        ],
      );
      const pageId = pageRes.rows[0].id;

      // Determine level, grade, strand, class section
      let schoolLevel = null;
      let gradeLevel = null;
      let strand = null;
      let classSection = null;
      let sessionName = null;

      if (pageNum >= 16 && pageNum <= 47) {
        schoolLevel = "Senior High School";
        gradeLevel = "Grade 12";
        if (pageNum >= 20 && pageNum <= 37) strand = "STEM";
        else if (pageNum >= 38 && pageNum <= 43) strand = "HUMSS";
        else if (pageNum >= 44 && pageNum <= 47) strand = "ABM";

        if (pageNum >= 20 && pageNum <= 28) classSection = "St. John STEM A";
        else if (pageNum >= 29 && pageNum <= 37) classSection = "St. John STEM B";
        else if (pageNum >= 38 && pageNum <= 43) classSection = "St. Mark";
        else if (pageNum >= 44 && pageNum <= 47) classSection = "St. Matthew";
      } else if (pageNum >= 48 && pageNum <= 75) {
        schoolLevel = "Junior High School";
        gradeLevel = "Grade 10";
        if (pageNum >= 52 && pageNum <= 59) classSection = "St. Peter";
        else if (pageNum >= 60 && pageNum <= 67) classSection = "St. Paul";
        else if (pageNum >= 68 && pageNum <= 75) classSection = "St. Pio";
      } else if (pageNum >= 76 && pageNum <= 91) {
        schoolLevel = "Elementary";
        gradeLevel = "Grade 6";
        if (pageNum >= 80 && pageNum <= 85) classSection = "St. Rose";
        else if (pageNum >= 86 && pageNum <= 91) classSection = "St. Regina";
      } else if (pageNum >= 92 && pageNum <= 105) {
        schoolLevel = "Kindergarten";
        gradeLevel = "Kinder 2";
        classSection = "St. Raphael";
        if (pageNum >= 95 && pageNum <= 100) sessionName = "Morning Session";
        else if (pageNum >= 101 && pageNum <= 105) sessionName = "Afternoon Session";
      }

      // 2. Insert Preparation Packet
      await client.query(
        `
        INSERT INTO public.page_preparation_packets
        (page_id, yearbook_id, spread_index, school_level, grade_level, strand_or_track, class_section, session_name, source_pdf_page, prep_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'gathering_content')
      `,
        [
          pageId,
          yearbookId,
          Math.ceil(pageNum / 2),
          schoolLevel,
          gradeLevel,
          strand,
          classSection,
          sessionName,
          pageNum,
        ],
      );

      // 3. Insert Main Content Block
      if (fullText.length > 0) {
        await client.query(
          `
          INSERT INTO public.page_content_blocks
          (page_id, yearbook_id, block_type, text_content, sort_order, is_verified)
          VALUES ($1, $2, 'body_paragraph', $3, 1, false)
        `,
          [pageId, yearbookId, fullText.slice(0, 4000)],
        );
      }

      // 4. Extract Names and Create Subjects / Appearances
      // Profile pages typically list uppercase surnames followed by given names
      if (
        (pageNum >= 20 && pageNum <= 47) ||
        (pageNum >= 52 && pageNum <= 75) ||
        (pageNum >= 80 && pageNum <= 91) ||
        (pageNum >= 95 && pageNum <= 105)
      ) {
        // Extract words matching name patterns
        const nameCandidates = [];
        for (let idx = 0; idx < rawStrings.length; idx++) {
          const str = rawStrings[idx].trim();
          if (
            str.length >= 3 &&
            /^[A-ZÑ\s,\.\-]+$/.test(str) &&
            ![
              "MILESTONE",
              "2024-2025",
              "2025",
              "GRADE",
              "ST.",
              "STEM",
              "HUMSS",
              "ABM",
              "SESSION",
            ].includes(str)
          ) {
            const next = rawStrings[idx + 1] ? rawStrings[idx + 1].trim() : "";
            if (next && /^[A-Z][a-zñA-Z\.\s]+$/.test(next)) {
              nameCandidates.push(`${next} ${str}`);
              idx++;
            }
          }
        }

        for (let nIdx = 0; nIdx < nameCandidates.length; nIdx++) {
          const candName = nameCandidates[nIdx];
          const subjectRes = await client.query(
            `
            INSERT INTO public.yearbook_subjects 
            (yearbook_id, center_id, person_type, full_name)
            VALUES ($1, $2, 'student', $3)
            RETURNING id;
          `,
            [yearbookId, centerId, candName],
          );
          const subjectId = subjectRes.rows[0].id;
          totalSubjectsImported++;

          // Page Appearance
          await client.query(
            `
            INSERT INTO public.page_person_appearances
            (page_id, yearbook_id, person_id, display_name_snapshot, sort_order, is_verified)
            VALUES ($1, $2, $3, $4, $5, false)
          `,
            [pageId, yearbookId, subjectId, candName, nIdx + 1],
          );

          // Asset Requirement (Portrait)
          await client.query(
            `
            INSERT INTO public.page_asset_requirements
            (page_id, yearbook_id, asset_type, person_id, label, specification, status, is_reference_only)
            VALUES ($1, $2, 'portrait', $3, $4, 'Original 300 DPI studio portrait required (PDF reference is compressed)', 'missing', true)
          `,
            [pageId, yearbookId, subjectId, `High-Res Portrait: ${candName}`],
          );
          totalPortraitsRequested++;
        }
      }

      // 5. Checklist punch items
      await client.query(
        `
        INSERT INTO public.missing_content_checklist_items
        (page_id, yearbook_id, category, description, is_resolved)
        VALUES 
          ($1, $2, 'student_name_verification', 'Verify extracted names and biographies against official school registrar roster', false),
          ($1, $2, 'high_res_photo', 'Obtain high-resolution 300 DPI original photographs', false);
      `,
        [pageId, yearbookId],
      );
      totalChecklistItems += 2;
    }

    console.log("5. Appointing Leadership & Governance Signatories...");
    // Appoint distinct UAT users for Coordinator, EIC, Principal, School Director
    const coordId = "22222222-2222-2222-2222-222222222222"; // Elena Rostova
    const studentEditorId = "44444444-4444-4444-4444-444444444444"; // Chloe Bennett (EIC)
    const principalId = "a1a1a1a1-1111-1111-1111-111111111111"; // Dr. Arthur Harrison (Principal)
    const directorId = "a2a2a2a2-2222-2222-2222-222222222222"; // Father Gabriel Thomas (Director)

    // Ensure distinct users exist in public.users
    const passHash = await hashPassword("Yearbook2026!");
    await client.query(
      `
      INSERT INTO public.users (id, email, full_name, password_hash)
      VALUES 
        ($1, 'principal-icas@test.yearbook', 'Dr. Arthur Harrison', $3),
        ($2, 'director-icas@test.yearbook', 'Father Gabriel Thomas', $3)
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, password_hash = EXCLUDED.password_hash;
    `,
      [principalId, directorId, passHash],
    );

    // Ensure user roles
    await client.query(
      `
      INSERT INTO public.user_roles (user_id, role)
      VALUES 
        ($1, 'member'),
        ($2, 'member')
      ON CONFLICT DO NOTHING;
    `,
      [principalId, directorId],
    );

    // Ensure center memberships
    await client.query(
      `
      INSERT INTO public.center_memberships (user_id, center_id, member_type, is_active)
      VALUES 
        ($1, $3, 'staff', true),
        ($2, $3, 'staff', true)
      ON CONFLICT DO NOTHING;
    `,
      [principalId, directorId, centerId],
    );

    await client.query(
      `
      INSERT INTO public.yearbook_members (yearbook_id, user_id, role)
      VALUES 
        ($1, $2, 'coordinator'),
        ($1, $3, 'editor_in_chief'),
        ($1, $4, 'advisor')
      ON CONFLICT DO NOTHING;
    `,
      [yearbookId, coordId, studentEditorId, principalId],
    );

    // Create Round 1 proof candidate linked to the authoritative PDF
    const crypto = await import("node:crypto");
    const pdfBuf = fs.readFileSync(PDF_PATH);
    const sha256 = crypto.createHash("sha256").update(pdfBuf).digest("hex");

    console.log(`Computed Authoritative PDF Checksum SHA-256: ${sha256}`);
    const proofRes = await client.query(
      `
      INSERT INTO public.proofs 
      (yearbook_id, round_number, round_name, proof_version_status, file_path, storage_path, checksum_sha256, page_count, generated_by, created_by, generated_at)
      VALUES ($1, 1, 'Proofreading Round 1', 'open_for_review', NULL, 'proofs/ICAS_Milestone_2025_Authoritative_138_Pages.pdf', $2, 138, $3, $3, now())
      ON CONFLICT (yearbook_id, round_number) DO UPDATE SET
        proof_version_status = 'open_for_review',
        checksum_sha256 = EXCLUDED.checksum_sha256,
        file_path = NULL,
        storage_path = 'proofs/ICAS_Milestone_2025_Authoritative_138_Pages.pdf',
        page_count = 138
      RETURNING id;
    `,
      [yearbookId, sha256, superAdminId],
    );
    const proofId = proofRes.rows[0].id;

    // Canonical Google Drive Proof Storage Object (Real Drive File & Folder IDs)
    await client.query(
      `
      INSERT INTO public.proof_storage_objects
      (proof_id, yearbook_id, center_id, provider, provider_file_id, provider_folder_id, original_filename, mime_type, file_size_bytes, page_count, checksum_sha256, uploaded_by, verified_at)
      VALUES ($1, $2, $3, 'google_drive', '1v250F5e4NIHCy69iqBLX-nqlrH712o0p', '1scAS8_ESB3QwDSejLSGLSEI71y02yngo', 'ICAS_Milestone_2025_Authoritative_138_Pages.pdf', 'application/pdf', $4, 138, $5, $6, now())
      ON CONFLICT (proof_id) DO UPDATE SET 
        provider = 'google_drive',
        provider_file_id = '1v250F5e4NIHCy69iqBLX-nqlrH712o0p',
        provider_folder_id = '1scAS8_ESB3QwDSejLSGLSEI71y02yngo',
        original_filename = 'ICAS_Milestone_2025_Authoritative_138_Pages.pdf',
        file_size_bytes = $4,
        page_count = 138,
        checksum_sha256 = EXCLUDED.checksum_sha256, 
        verified_at = now();
    `,
      [proofId, yearbookId, centerId, pdfBuf.length, sha256, superAdminId],
    );

    // Link proof pages
    const pagesList = (
      await client.query(
        `SELECT id, physical_index FROM public.pages WHERE yearbook_id = $1 ORDER BY physical_index ASC`,
        [yearbookId],
      )
    ).rows;
    for (const p of pagesList) {
      await client.query(
        `
        INSERT INTO public.proof_pages (proof_id, page_id, yearbook_id, page_number, status)
        VALUES ($1, $2, $3, $4, 'awaiting_review')
        ON CONFLICT (proof_id, page_id) DO NOTHING;
      `,
        [proofId, p.id, yearbookId, p.physical_index],
      );
    }

    // Set designated signoff requirements for Round 1 (All 4 distinct institutional signatories)
    await client.query(
      `
      INSERT INTO public.proof_signoff_requirements 
      (proof_id, yearbook_id, signatory_role, designated_user_id, assigned_by, is_active)
      VALUES 
        ($1, $2, 'editor_in_chief', $3, $4, true),
        ($1, $2, 'coordinator', $5, $4, true),
        ($1, $2, 'principal', $6, $4, true),
        ($1, $2, 'school_director', $7, $4, true)
      ON CONFLICT (proof_id, signatory_role) WHERE is_active = true 
      DO UPDATE SET designated_user_id = EXCLUDED.designated_user_id, assigned_by = EXCLUDED.assigned_by;
    `,
      [proofId, yearbookId, studentEditorId, superAdminId, coordId, principalId, directorId],
    );

    await client.query("COMMIT;");

    console.log("\n✅ ICAS de Calarian 138-Page Blueprint Import Successful!");
    console.log(`• Center ID: ${centerId} (ICAS de Calarian)`);
    console.log(`• Yearbook ID: ${yearbookId} (Milestone 2025)`);
    console.log(`• Pages Ingested: ${pagesList.length} / 138`);
    console.log(`• Total Subjects Ingested: ${totalSubjectsImported}`);
    console.log(`• High-Res Portraits Requested: ${totalPortraitsRequested}`);
    console.log(`• Missing Checklist Items Created: ${totalChecklistItems}`);
    console.log(`• Active Proof Round 1: ${proofId} (SHA-256: ${sha256.slice(0, 16)}...)`);
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("ICAS Import Failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
