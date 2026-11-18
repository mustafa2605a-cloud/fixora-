import {
  CategoryStrip,
  CtaBanner,
  Faq,
  Hero,
  HowItWorks,
  PopularServices,
  Testimonials,
} from '@/components/site/home-sections'

export default function HomePage() {
  return (
    <>
      <Hero />
      <CategoryStrip />
      <PopularServices />
      <HowItWorks />
      <Testimonials />
      <Faq />
      <CtaBanner />
    </>
  )
}
