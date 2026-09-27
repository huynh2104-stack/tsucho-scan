'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'

// 81 → "1:21"
function phutGiay(giay: number) {
  const s = Math.round(giay)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* VIDEO GIỚI THIỆU — khoảng 1 phút rưỡi, giọng đọc + chữ tiếng Nhật.
 *
 * Nguồn dựng ở tools/video: một trang HTML tự vẽ từng khung hình, script
 * quay ra MP4 (H.264 — iPhone phát được). Muốn sửa chữ hay nhịp thì sửa ở
 * đó rồi quay lại, đừng sửa file MP4.
 *
 * preload="metadata": lúc vào trang chỉ tải phần đầu file để biết độ dài;
 * cả file chỉ tải khi người xem bấm phát, nên trang không chậm đi.
 *
 * Đổi độ dài video thì nhớ sửa chữ「約1分半」trong lib/i18n.tsx (t.video).
 *
 * Nút phát to đặt DƯỚI dòng khẩu hiệu của ảnh bìa (78% chiều cao; điện
 * thoại 81% và nút nhỏ hơn, không thì chạm khẩu hiệu): thanh điều khiển
 * gốc của Chrome chỉ có nút nhỏ ở góc, người lớn tuổi dễ không thấy. Ảnh
 * bìa cố ý chụp lúc ba thẻ tính năng chưa hiện, chừa chỗ trống cho nút.
 * Bấm rồi thì trả lại điều khiển gốc (tua, toàn màn hình).
 */
export function IntroVideo() {
  const { t } = useI18n()
  const v = t.video
  const video = useRef<HTMLVideoElement>(null)
  const [daBam, setDaBam] = useState(false)
  // Độ dài đọc từ chính file, không ghi cứng: quay lại video là tự đúng.
  // Trình duyệt có thể nạp xong phần đầu file TRƯỚC khi React gắn sự kiện,
  // nên lúc gắn xong phải tự hỏi lại một lần.
  const [doDai, setDoDai] = useState('')
  const docDoDai = () => {
    const d = video.current?.duration
    if (d && Number.isFinite(d)) setDoDai(phutGiay(d))
  }
  useEffect(docDoDai, [])

  return (
    <div className="mx-auto w-full max-w-[60rem]">
      <figure className="khung-anh m-0">
        <div className="relative aspect-video overflow-hidden rounded-[4px] bg-desk">
          <video
            ref={video}
            className="block h-full w-full"
            poster="/video/gioi-thieu-poster.jpg"
            preload="metadata"
            playsInline
            controls={daBam}
            aria-label={v.title}
            onLoadedMetadata={docDoDai}
            onPlay={() => setDaBam(true)}
          >
            <source src="/video/gioi-thieu.mp4" type="video/mp4" />
          </video>

          {!daBam && (
            <button
              type="button"
              onClick={() => {
                setDaBam(true)
                video.current?.play()
              }}
              className="group absolute inset-0 cursor-pointer"
            >
              <span className="absolute top-[81%] left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-paper-3 py-1 pr-3 pl-1 whitespace-nowrap text-sumi shadow-[0_12px_30px_-10px_rgba(0,0,0,0.55)] transition-transform duration-200 group-hover:scale-[1.04] sm:top-[78%] sm:gap-3 sm:py-2.5 sm:pr-6 sm:pl-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-shu text-paper-3 sm:h-11 sm:w-11">
                  <svg viewBox="0 0 24 24" className="ml-0.5 h-3.5 w-3.5 sm:h-5 sm:w-5" fill="currentColor" aria-hidden>
                    <path d="M8 5.5v13l11-6.5z" />
                  </svg>
                </span>
                <span className="text-[12px] font-medium sm:text-[15px]">{v.play}</span>
                {doDai && <span className="tnum text-[11px] text-sumi-2 sm:text-[13px]">{doDai}</span>}
              </span>
            </button>
          )}
        </div>
      </figure>
      <p className="mt-3 text-[13px] leading-relaxed text-sumi-2 sm:hidden">{v.phone}</p>
    </div>
  )
}
