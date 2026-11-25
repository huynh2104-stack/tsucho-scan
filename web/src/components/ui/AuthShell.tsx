"use client";

import type { ReactNode } from "react";

import LangMenu from "@/components/LangMenu";
import { BrandMark } from "@/components/ui/Brand";
import { useT } from "@/lib/i18n";

/** Khung chung cho /verify, /reset, /forgot: dải mực mảnh có tên app + nút ngôn ngữ, thẻ ở giữa. */
export default function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-page">
      <header className="on-ink flex h-12 flex-none items-center justify-between bg-shell pl-4 pr-1 text-shellink">
        <span className="flex items-center gap-2">
          <BrandMark size={24} />
          <span className="text-t15 font-bold">{t.appName}</span>
        </span>
        <LangMenu className="max-sm:h-10 max-sm:w-10 max-sm:px-0" />
      </header>
      <div className="thin-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="m-auto w-full max-w-[484px] px-4 py-8 sm:py-12">
          <div className="rounded-[3px] bg-card px-6 pb-6 pt-5 shadow-ply">{children}</div>
        </div>
      </div>
    </div>
  );
}
