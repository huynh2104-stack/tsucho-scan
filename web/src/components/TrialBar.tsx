"use client";

import Link from "next/link";

import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

/** Dải mảnh dưới thanh trên cho tài khoản «お試し». Chỉ nhắc, không chặn chức năng nào. */
export default function TrialBar() {
  const { t } = useT();
  const { user } = useAuth();
  if (!user || user.kind !== "trial") return null;
  const left = user.quota?.left;
  return (
    <div
      data-testid="trial-bar"
      className="flex flex-none flex-wrap items-center justify-center gap-x-3 gap-y-0.5 border-b border-rule bg-card2 px-4 py-1.5 text-t13 leading-[1.5] text-ink2"
    >
      <span>{left == null ? t.trialHead : t.trialBarText(left)}</span>
      <Link href="/login/?tab=register" className="font-bold text-accent underline hover:text-accenthover">
        {t.trialBarUp}
      </Link>
    </div>
  );
}
