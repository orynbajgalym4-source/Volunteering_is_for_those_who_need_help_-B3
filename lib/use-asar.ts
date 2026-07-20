"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./client";
import type { AsarView } from "./types";

export function useAsar(id: string) {
  const [asar, setAsar] = useState<AsarView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try { const data = await api<{ asar: AsarView }>(`/api/asars/${id}`); setAsar(data.asar); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось загрузить асар"); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => {
    let active = true;
    api<{ asar: AsarView }>(`/api/asars/${id}`)
      .then((data) => { if (active) { setAsar(data.asar); setError(""); } })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Не удалось загрузить асар"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  return { asar, setAsar, loading, error, refresh };
}
