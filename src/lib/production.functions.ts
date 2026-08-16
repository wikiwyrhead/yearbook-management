import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function unwrap<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw res.error;
  if (!res.data) throw new Error("Not found");
  return res.data;
}

export const getReadinessReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }): Promise<any> => {
    const { supabase } = context;
    
    // 1. Pages status
    const { data: pages } = await (supabase as any)
      .from("pages")
      .select("id, title, page_number, design_status")
      .eq("yearbook_id", data.yearbookId);

    // 2. Open corrections
    const { data: corrections } = await (supabase as any)
      .from("corrections")
      .select("id, page_id, status")
      .eq("yearbook_id", data.yearbookId)
      .not("status", "in", "('verified', 'closed', 'rejected', 'cancelled')");

    // 3. Asset completion
    const { data: requirements } = await (supabase as any)
      .from("page_requirements")
      .select("needed, have")
      .eq("yearbook_id", data.yearbookId);

    // 4. Production lock status
    const { data: lock } = await (supabase as any)
      .from("yearbook_approvals")
      .select("*")
      .eq("yearbook_id", data.yearbookId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const totalPages = pages?.length || 0;
    const completePages = pages?.filter((p: any) => p.design_status === 'complete').length || 0;
    const openCorrections = corrections?.length || 0;
    const neededAssets = requirements?.reduce((a: number, b: any) => a + b.needed, 0) || 0;
    const haveAssets = requirements?.reduce((a: number, b: any) => a + b.have, 0) || 0;


    return {
      totalPages,
      completePages,
      openCorrections,
      assetProgress: neededAssets > 0 ? (haveAssets / neededAssets) * 100 : 100,
      isLocked: lock?.status === 'locked',
      lockDetails: lock,
      ready: totalPages > 0 && 
             completePages === totalPages && 
             openCorrections === 0 && 
             haveAssets >= neededAssets
    };
  });

export const getProofreaderAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string(), userId: z.string() }))
  .handler(async ({ data, context }): Promise<any> => {
    const { supabase } = context;
    return unwrap(
      await (supabase as any)
        .from("page_assignments")
        .select("page_id")
        .eq("yearbook_id", data.yearbookId)
        .eq("user_id", data.userId)
        .eq("kind", "proofreader")
    );
  });
