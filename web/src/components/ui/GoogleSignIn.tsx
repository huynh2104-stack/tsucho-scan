"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ApiError, googleNonce } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  gisNeedsInit,
  initGis,
  loadGis,
  renderGisButton,
  resetGisInit,
  setGisHandler,
  type GisId,
} from "@/lib/gis";
import { useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

/**
 * Nút «Sign in with Google» của Google (cá nhân hoá: «Sign in as <tên>» cho người từng đăng nhập).
 * Hiện `fallback` (nút chuyển hướng thường) cho tới khi nút Google THỰC SỰ vẽ xong; script hỏng/chậm thì giữ nguyên
 * `fallback`. Không bao giờ hiện cả hai.
 */
export default function GoogleSignIn({
  clientId,
  next,
  fallback,
  onError,
}: {
  clientId: string;
  /** Đường dẫn nội bộ đã qua `safeNext` */
  next: string;
  fallback: ReactNode;
  onError: (e: unknown) => void;
}) {
  const { lang } = useT();
  const { resolved } = useTheme();
  const { google } = useAuth();
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [gis, setGis] = useState<GisId | null>(null);
  const [shown, setShown] = useState(false);
  const cb = useRef({ google, router, next, onError });
  cb.current = { google, router, next, onError };

  const [epoch, setEpoch] = useState(0); // tăng mỗi lần initialize lại → vẽ lại nút

  // Nonce (cookie HttpOnly) rồi script rồi initialize — lỗi ở bất kỳ bước nào: giữ nút dự phòng.
  // initialize lại khi chưa init hoặc nonce quá 25 phút; credential luôn đi qua handler của component HIỆN TẠI.
  useEffect(() => {
    let dead = false;
    const reinit = async (force: boolean) => {
      const id = await loadGis();
      if (force || gisNeedsInit()) initGis(id, clientId, (await googleNonce()).nonce);
      if (dead) return;
      setGis(id);
      setEpoch((n) => n + 1);
    };
    setGisHandler(async (credential) => {
      try {
        await cb.current.google(credential);
        resetGisInit(); // cookie nonce đã bị xoá: lần vào trang đăng nhập sau cần nonce mới
        cb.current.router.replace(cb.current.next);
      } catch (e) {
        if (e instanceof ApiError && e.code === "state") {
          try {
            await reinit(true); // nonce lệch (hai tab...): lấy nonce mới, báo người dùng bấm lại
          } catch {
            /* giữ thông báo lỗi bên dưới */
          }
        }
        cb.current.onError(e);
      }
    });
    reinit(false).catch(() => {
      /* giữ fallback */
    });
    return () => {
      dead = true;
      setGisHandler(null);
    };
  }, [clientId]);

  // Vẽ lại khi đổi ngôn ngữ / giao diện sáng-tối
  useEffect(() => {
    const el = box.current;
    if (!gis || !el) return;
    setShown(false);
    renderGisButton(gis, el, { theme: resolved, lang, width: wrap.current?.clientWidth ?? 400 });
    const seen = () => {
      if (el.childElementCount > 0) {
        setShown(true);
        return true;
      }
      return false;
    };
    if (seen()) return;
    const mo = new MutationObserver(() => seen() && mo.disconnect());
    mo.observe(el, { childList: true });
    return () => mo.disconnect();
  }, [gis, epoch, lang, resolved]);

  return (
    <div ref={wrap} className="relative">
      {!shown && fallback}
      <div
        ref={box}
        data-testid="btn-google-gis"
        className={shown ? "flex justify-center" : "pointer-events-none absolute inset-x-0 top-0 flex justify-center opacity-0"}
        aria-hidden={!shown}
      />
    </div>
  );
}
