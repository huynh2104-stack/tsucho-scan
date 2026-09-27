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
  Video,
  Workspace,
} from '@/components/sections'
import { Pricing } from '@/components/pricing'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

/* Presentation flow: product → hands-on walkthrough → verification →
 * real workspace → supported passbooks → tools → output → limits/cost. */
export default function Page() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <Video />
        <How />
        <Verify />
        <Workspace />
        <Reads />
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
