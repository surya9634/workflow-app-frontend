import React from "react";
import { ArrowRight, Sparkles } from "lucide-react";

const CTA = () => {
  const handleGetStarted = () => {
    // Replace with your actual Microsoft Form URL
    window.open('https://forms.microsoft.com/your-form-link', '_blank');
  };

  return (
    <section className="relative py-32 bg-black overflow-hidden">
      {/* Subtle grid background */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:50px_50px]"></div>
      </div>
      
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Icon Badge */}
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-800 border border-gray-700 rounded-xl mb-8">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        
        {/* Main Heading */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-8 leading-tight">
          Our platform is{" "}
          <span className="text-blue-400">
            free
          </span>{" "}
          for the first{" "}
          <span className="text-white bg-gray-800 px-3 py-1 rounded-lg border border-gray-600">
            100
          </span>{" "}
          registered businesses.
        </h1>
        
        {/* Subtext */}
        <p className="text-lg sm:text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
          Join the exclusive early access program and secure your spot today.
        </p>
        
        {/* CTA Button */}
        <div className="inline-block">
          <button
            onClick={handleGetStarted}
            className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors flex items-center space-x-2 group"
          >            
            <span className="relative flex items-center space-x-3">
              <span>Get Free Access</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
            </span>
          </button>
        </div>
        
        {/* Trust Indicators */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-6 text-gray-500 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>No Credit Card Required</span>
          </div>
          <div className="hidden sm:block w-px h-4 bg-gray-700"></div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span>Full Feature Access</span>
          </div>
          <div className="hidden sm:block w-px h-4 bg-gray-700"></div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
            <span>Limited Time</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;