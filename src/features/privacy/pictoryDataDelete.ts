interface PictoryDeleteEnv {
  VITE_PICTORY_DELETE_ENDPOINT?: string;
}

export type PictoryServerDeleteStatus =
  | "skipped"
  | "deleted"
  | "missing"
  | "serverFailed";

export interface PictoryServerDeleteResult {
  status: PictoryServerDeleteStatus;
}

interface DeleteResponse {
  deleted?: boolean;
}

export async function deletePictoryServerData(
  env: PictoryDeleteEnv = import.meta.env as PictoryDeleteEnv,
): Promise<PictoryServerDeleteResult> {
  const endpoint = env.VITE_PICTORY_DELETE_ENDPOINT?.trim();
  if (!endpoint) {
    return { status: "skipped" };
  }

  try {
    const response = await fetch(endpoint, {
      method: "DELETE",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-Pictory-Request-Id": `delete-${Date.now()}`,
      },
    });

    if (!response.ok) {
      return { status: "serverFailed" };
    }

    const data = (await response.json()) as DeleteResponse;
    return { status: data.deleted === false ? "missing" : "deleted" };
  } catch {
    return { status: "serverFailed" };
  }
}
