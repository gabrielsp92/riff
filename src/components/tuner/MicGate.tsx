"use client";

import { Permission } from "@/lib/store";

export function MicGate({
  permission,
  onRequest,
}: {
  permission: Permission;
  onRequest: () => void;
}) {
  const denied = permission === "denied";
  return (
    <div className="m-4 flex flex-1 flex-col items-center justify-center gap-4 border-2 border-divider p-8 text-center">
      <div className="font-mono-rf text-[10px] tracking-[.14em] text-neutral-600">
        {denied ? "MICROPHONE BLOCKED" : "MICROPHONE ACCESS REQUIRED"}
      </div>
      {denied ? (
        <p className="max-w-[280px] text-sm text-neutral-700">
          Enable microphone access for this site in your browser settings, then reload.
        </p>
      ) : (
        <>
          <p className="max-w-[280px] text-sm text-neutral-700">
            RIFF listens through your mic to detect pitch. Nothing is recorded or leaves your
            device.
          </p>
          <button
            onClick={onRequest}
            disabled={permission === "requesting"}
            className="bg-accent px-4 py-3 font-sans text-xs font-extrabold tracking-[.1em] text-white disabled:opacity-60"
          >
            {permission === "requesting" ? "REQUESTING…" : "ENABLE MICROPHONE"}
          </button>
        </>
      )}
    </div>
  );
}
