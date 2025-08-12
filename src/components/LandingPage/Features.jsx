import React, { useEffect, useRef } from "react";
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
    icon: <Zap className="w-14 h-14 text-blue-400" />,
    title: "Lightning Fast Performance",
    description: "Optimized algorithms ensure your campaigns execute in milliseconds.",
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    icon: <Calendar className="w-14 h-14 text-green-400" />,
    title: "Smart Scheduling",
    description: "AI-powered posting times based on audience engagement patterns.",
    gradient: "from-green-500 to-emerald-500",
  },
  {
    icon: <BarChart3 className="w-14 h-14 text-purple-400" />,
    title: "Campaign Automation",
    description: "Create intelligent workflows that respond to user interactions.",
    gradient: "from-purple-500 to-violet-500",
  },
  {
    icon: <TrendingUp className="w-14 h-14 text-orange-400" />,
    title: "Advanced Analytics",
    description: "AI-driven recommendations for growth and engagement optimization.",
    gradient: "from-orange-500 to-red-500",
  },
  {
    icon: <Shield className="w-14 h-14 text-red-400" />,
    title: "Enterprise Security",
    description: "Bank-level encryption and compliance standards for your data.",
    gradient: "from-red-500 to-pink-500",
  },
  {
    icon: <Clock className="w-14 h-14 text-indigo-400" />,
    title: "24/7 Monitoring",
    description: "Continuous monitoring ensures your campaigns run smoothly.",
    gradient: "from-indigo-500 to-purple-500",
  },
];

const FeatureCard = ({ feature }) => (
  <div className="flex-shrink-0 w-full md:w-1/2 px-6">
    <div className="bg-[#111] rounded-2xl p-10 h-full border border-gray-800 hover:border-gray-600 transition-all duration-500 group">
      <div className="mb-6">
        <div className="p-5 rounded-xl bg-gray-800 inline-block">
          {feature.icon}
        </div>
      </div>
      <h3 className="text-3xl font-bold text-white mb-4">{feature.title}</h3>
      <p className="text-gray-300 text-lg">{feature.description}</p>
    </div>
  </div>
);

const Features = () => {
  const containerRef = useRef(null);
  const scrollTrackRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current || !scrollTrackRef.current) return;

      const container = containerRef.current;
      const scrollTrack = scrollTrackRef.current;
      const containerRect = container.getBoundingClientRect();
      const scrollY = window.scrollY;
      const startY = container.offsetTop;
      const endY = startY + container.offsetHeight - window.innerHeight;

      if (scrollY >= startY && scrollY <= endY) {
        const progress = (scrollY - startY) / (endY - startY);
        const maxTranslate = scrollTrack.scrollWidth - scrollTrack.clientWidth;
        scrollTrack.style.transform = `translateX(-${progress * maxTranslate}px)`;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div ref={containerRef} className="relative" style={{ height: "400vh" }}>
      <div className="sticky top-0 h-screen flex items-center justify-center bg-black overflow-hidden">
        <div className="max-w-7xl px-8 w-full">
          <h2 className="text-5xl font-bold text-center text-white mb-12">
            Our Powerful Features
          </h2>
          <div
            ref={scrollTrackRef}
            className="flex transition-transform duration-200 ease-out"
            style={{ willChange: "transform" }}
          >
            {features.map((feature, index) => (
              <FeatureCard key={index} feature={feature} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Features;
