import * as React from "react"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "../LandingPage/FeatureCarousel"
import {
  Zap,
  Calendar,
  BarChart3,
  TrendingUp,
  Shield,
  Clock,
} from "lucide-react";

const features = [
  {
    icon: <Zap className="w-8 h-8 text-blue-400" />,
    title: "Multi-Platform Integration",
    description:
      "Connect Instagram, WhatsApp, and Facebook in one unified dashboard. Manage all your social presence from a single interface.",
  },
  {
    icon: <Calendar className="w-8 h-8 text-green-400" />,
    title: "Smart Scheduling",
    description:
      "AI-powered optimal posting times based on your audience engagement patterns. Never miss the perfect moment to connect.",
  },
  {
    icon: <BarChart3 className="w-8 h-8 text-purple-400" />,
    title: "Campaign Automation",
    description:
      "Create intelligent workflows that respond to user interactions, automate responses, and nurture leads across all platforms.",
  },
  {
    icon: <TrendingUp className="w-8 h-8 text-orange-400" />,
    title: "Advanced Analytics",
    description:
      "Deep insights into your social media performance with AI-driven recommendations for growth and engagement optimization.",
  },
  {
    icon: <Shield className="w-8 h-8 text-red-400" />,
    title: "User-Friendly Setup",
    description:
      "Get started in minutes with our intuitive onboarding process. No technical expertise required to unleash powerful automation.",
  },
  {
    icon: <Clock className="w-8 h-8 text-indigo-400" />,
    title: "24/7 Monitoring",
    description:
      "Continuous monitoring and automatic adjustments ensure your campaigns run smoothly around the clock.",
  },
];
export default function FeatureCarousel() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-10">
      <Carousel>
        <CarouselContent>
          {features.map((feature, index) => (
            <CarouselItem
              key={index}
              className="md:basis-1/2 lg:basis-1/2 xl:basis-1/3"
            >
              <div className="rounded-2xl bg-gray-100 dark:bg-zinc-900 p-8 shadow-md h-full flex flex-col justify-between">
                <h3 className="text-xl font-bold mb-2 text-primary">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-[-40px]" />
        <CarouselNext className="right-[-40px]" />
      </Carousel>
    </div>
  )
}
