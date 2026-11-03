import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { createUploadUrlFn, recordUploadFn } from "@/lib/flux.functions";
import { errMsg, putWithProgress } from "@/lib/data";

export type UploadState = { totalBytes: number; doneBytes: number; totalFiles: number; doneFiles: number; errors: string[]; running: boolean };
const idle: UploadState = { totalBytes: 0, doneBytes: 0, totalFiles: 0, doneFiles: 0, errors: [], running: false };

/** Uploads files (keeping folder paths) to a bucket via presigned PUT, with real byte progress. */
export function useUploader() {
  const [state, setState] = useState<UploadState>(idle);
  const sign = useServerFn(createUploadUrlFn);
  const record = useServerFn(recordUploadFn);
  const qc = useQueryClient();

  const upload = async (bucketId: string, files: File[], prefix = "") => {
    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    setState({ ...idle, totalBytes, totalFiles: files.length, running: true });
    const keys: string[] = [];
    let base = 0;
    for (const f of files) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const key = `${prefix}${rel}`.replace(/^\/+/, "");
      try {
        const { url } = await sign({ data: { bucketId, key } });
        await putWithProgress(url, f, (loaded) => setState((s) => ({ ...s, doneBytes: base + loaded })));
        await record({ data: { bucketId, key, size: f.size } });
        keys.push(key);
        setState((s) => ({ ...s, doneFiles: s.doneFiles + 1 }));
      } catch (e) {
        setState((s) => ({ ...s, errors: [...s.errors, `${rel}: ${errMsg(e)}`] }));
      }
      base += f.size;
      setState((s) => ({ ...s, doneBytes: base }));
    }
    setState((s) => ({ ...s, running: false }));
    qc.invalidateQueries({ queryKey: ["uploads"] });
    qc.invalidateQueries({ queryKey: ["links"] });
    return keys;
  };
  return { state, upload, reset: () => setState(idle) };
}
