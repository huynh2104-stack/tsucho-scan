import {
  Cta,
  Excel,
  Faq,
  Hero,
  How,
  Limits,
  Reads,
  Tools,
  Verify,
  Workspace,
} from '@/components/sections'
import { Pricing } from '@/components/pricing'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

/* Thứ tự đi theo câu hỏi người xem đặt ra, không theo thói quen xếp trang
 * bán hàng:
 *   nó làm gì  →  sổ khó thế nào  →  sao tin được  →  màn hình ra sao
 *   →  làm theo mấy bước  →  chỉnh ảnh  →  file nhận về  →  sai tới đâu
 *   →  giá bao nhiêu  →  hỏi đáp  →  thử đi
 * Mục "sai tới đâu, tốn bao nhiêu" đặt TRƯỚC lời mời dùng, cố ý.
 *
 * Nền các phần đổi theo nhịp (giấy → giấy đậm → mặt bàn tối → giấy sáng)
 * để không có hai phần cạnh nhau cùng sắc độ — người dùng báo là các phần
 * nhìn giống nhau quá, khó phân biệt. */
export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Reads />
        <Verify />
        <Workspace />
        <How />
        <Tools />
        <Excel />
        <Limits />
        <Pricing />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </>
  )
}
