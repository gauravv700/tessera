"use client";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function Notifications() {
  const { notes, addNote } = useStore();
  useEffect(() => {
    api("/notifications")
      .then((rows: any[]) => {
        if (useStore.getState().notes.length === 0)
          [...rows].reverse().forEach(addNote);
      })
      .catch(() => undefined);
  }, [addNote]);
  return (
    <>
      <div className="panel-head">
        <h2>Activity</h2>
      </div>
      <div className="feed">
        {notes.length === 0 && (
          <div className="muted pad">Fills and alerts appear here.</div>
        )}
        {notes.map((n, i) => (
          <div key={i} className={n.type === "ALERT" ? "note alert" : "note"}>
            <span>{n.message}</span>
            <span className="muted">
              {new Date(n.createdAt).toLocaleTimeString([], { hour12: false })}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
