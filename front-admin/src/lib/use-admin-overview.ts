"use client";

import { useEffect, useState } from "react";
import { ApiError, adminApi } from "./api";

export function useAdminOverview() {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminApi.overview>>>();
  const [error, setError] = useState<ApiError>();

  useEffect(() => {
    let active = true;
    void adminApi.overview().then(
      (value) => active && setData(value),
      (cause: unknown) => active && setError(cause instanceof ApiError ? cause : new ApiError(500)),
    );
    return () => { active = false; };
  }, []);

  return { data, error, loading: !data && !error };
}
