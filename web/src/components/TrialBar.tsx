"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchAuthMethods, fetchMe } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

/** Dải mảnh dưới thanh trên cho tài khoản «お試し». Chỉ nhắc, không chặn chức năng nào. */
export default function TrialBar() {
  const { t } = useT();
  const { user } = useAuth();
  const [days, setDays] = useState(7);
  // Số trang còn lại hôm nay: hỏi lại /me (đối tượng user sau «một chạm» lấy từ câu trả lời tạo tài khoản, không có
  // quota) — mỗi lần quay lại tab cũng hỏi lại để số giảm đúng sau khi quét.
  const [left, setLeft] = useState<number | null | undefined>(undefined);
  const isTrial = user?.kind === "trial";
  const uid = user?.id;
  useEffect(() => {
    if (!isTrial) return;
    let con = true;
    fetchAuthMethods()
      .then((m) => con && setDays(m.trial_keep_days ?? 7))
      .catch(() => {});
    const hoi = () =>
      fetchMe()
        .then((m) => con && setLeft(m.quota?.left ?? null))
        .catch(() => {});
    void hoi();
    const onFocus = () => void hoi();
    window.addEventListener("focus", onFocus);
    return () => {
      con = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [isTrial, uid]);
  if (!user || user.kind !== "trial") return null;
  const conLai = left !== undefined ? left : user.quota?.left;
  return (
    <div
      data-testid="trial-bar"
      className="flex flex-none flex-wrap items-center justify-center gap-x-3 gap-y-0.5 border-b border-rule bg-card2 px-4 py-1.5 text-t13 leading-[1.5] text-ink2"
    >
      <span>
        {conLai == null ? t.trialHead : t.trialBarText(conLai)}
        {user.ephemeral && ` ・ ${t.trialBarKeep(days)}`}
      </span>
      <Link href="/login/?tab=register" className="font-bold text-accent underline hover:text-accenthover">
        {t.trialBarUp}
      </Link>
    </div>
  );
}
