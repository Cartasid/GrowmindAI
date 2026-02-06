import { useCallback, useEffect, useMemo, useState } from "react";
import type { JournalEntry } from "../types";
import {
  addJournalEntry,
  deleteJournalEntry,
  loadJournal,
  refreshJournal,
  saveJournal,
  subscribe as subscribeJournal,
} from "../services/journalService";

export type JournalStatus = "idle" | "loading" | "ready" | "error";

export const useJournal = (growId?: string) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [status, setStatus] = useState<JournalStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const updateLocalEntries = useCallback(() => {
    if (!growId) {
      setEntries([]);
      return;
    }
    const localEntries = loadJournal(growId);
    setEntries(localEntries);
    if (localEntries.length && !selectedId) {
      setSelectedId(localEntries[0].id);
    }
  }, [growId, selectedId]);

  useEffect(() => {
    if (!growId) {
      setEntries([]);
      setStatus("idle");
      return;
    }

    setStatus("loading");
    setError(null);
    updateLocalEntries();
    refreshJournal(growId)
      .catch((err) => {
        console.error("Journal refresh failed", err);
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      })
      .finally(() => {
        setStatus((prev: JournalStatus) => (prev === "error" ? prev : "ready"));
      });

    const unsubscribe = subscribeJournal(growId, () => {
      updateLocalEntries();
      setStatus("ready");
    });
    return () => {
      unsubscribe();
    };
  }, [growId, updateLocalEntries]);

  const addEntry = useCallback(
    async (entry: Partial<JournalEntry>): Promise<JournalEntry> => {
      if (!growId) {
        throw new Error("Missing growId for journal operations");
      }
      setStatus("loading");
      setError(null);
      try {
        const saved = await addJournalEntry(growId, entry);
        updateLocalEntries();
        setSelectedId(saved.id);
        setStatus("ready");
        return saved;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setStatus("error");
        throw err;
      }
    },
    [growId, updateLocalEntries]
  );

  const updateEntry = useCallback(
    async (entry: JournalEntry) => {
      if (!growId) {
        throw new Error("Missing growId for journal operations");
      }
      setStatus("loading");
      setError(null);
      try {
        const current = loadJournal(growId);
        const next = current.map((item) => (item.id === entry.id ? entry : item));
        await saveJournal(growId, next);
        updateLocalEntries();
        setStatus("ready");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setStatus("error");
        throw err;
      }
    },
    [growId, updateLocalEntries]
  );

  const removeEntry = useCallback(
    async (entryId: string) => {
      if (!growId) {
        throw new Error("Missing growId for journal operations");
      }
      setStatus("loading");
      setError(null);
      try {
        await deleteJournalEntry(growId, entryId);
        updateLocalEntries();
        setStatus("ready");
        setSelectedId((current: string | null) => (current === entryId ? null : current));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setStatus("error");
        throw err;
      }
    },
    [growId, updateLocalEntries]
  );

  const refresh = useCallback(async () => {
    if (!growId) return;
    setStatus("loading");
    setError(null);
    try {
      await refreshJournal(growId);
      updateLocalEntries();
      setStatus("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("error");
    }
  }, [growId, updateLocalEntries]);

  const selectedEntry = useMemo(() => {
    if (!entries.length) return null;
    if (selectedId) {
      return entries.find((entry: JournalEntry) => entry.id === selectedId) ?? null;
    }
    return entries[0];
  }, [entries, selectedId]);

  const selectEntry = useCallback((entryId: string | null) => {
    setSelectedId(entryId);
  }, []);

  return {
    entries,
    status,
    error,
    selectedId,
    selectedEntry,
    selectEntry,
    addEntry,
    updateEntry,
    removeEntry,
    refresh,
  };
};
