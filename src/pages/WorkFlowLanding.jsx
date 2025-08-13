import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import Navbar from "../components/LandingPage/Navbar";
import AuthModal from "../components/LandingPage/AuthModal";
import HeroSection from "../components/LandingPage/Hero";
import SocialProof from "../components/LandingPage/SocialProof";
import Features from "../components/LandingPage/Features";
import Testimonials from "../components/LandingPage/Testimonials";
import Pricing from "../components/LandingPage/Pricing";
import CTA from "../components/LandingPage/CTA";
import Footer from "../components/LandingPage/Footer";
import TextHoverEffect from "../components/LandingPage/TextHoverEffect";
import RevealOnScroll from "../components/animations/RevealAnimation";

const WorkFlowLanding = () => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  //Sign in and Log in Modal and form validation
  const validateForm = () => {
    const newErrors = {};
    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Invalid email format";
    }
    if (!password.trim()) {
      newErrors.password = "Password is required";
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

 const handleSubmit = async () => {
  if (!validateForm()) return;
  
  setIsLoading(true);
  
  try {
    // Use the api client for consistent API calls
    const response = isLogin 
      ? await authAPI.signin({ email, password })
      : await authAPI.signup({ email, password });

    // The api client automatically handles response parsing
    const { data } = response;

    if (data.success) {
      // Store token and user info
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify({
        id: data.user.id,
        email: data.user.email,
        role: data.user.role || 'user',
        onboardingCompleted: data.user.onboardingCompleted || false
      }));

      // Store whether this is a new signup for onboarding flow
      if (!isLogin) {
        localStorage.setItem('isNewSignup', 'true');
      }

      toast.success(data.message || (isLogin ? 'Signed in successfully!' : 'Account created successfully!'));
      setShowModal(false);
      
      // Navigation logic
      const userRole = data.user.role || 'user';
      
      if (userRole === 'admin') {
        // Admins always go to admin panel
        navigate('/admin');
      } else if (!isLogin) {
        // New signups go to onboarding
        navigate('/onboarding');
      } else {
        // Existing users logging in go to dashboard
        navigate('/dashboard');
      }
      
      // Reset form
      setEmail('');
      setPassword('');
      setErrors({});
    } else {
      // Handle validation errors from server
      if (data.errors) {
        setErrors(data.errors);
      } else {
        toast.error(data.message || 'Authentication failed');
      }
    }
  } catch (error) {
    console.error('Authentication error:', error);
    toast.error('Network error. Please try again.');
  } finally {
    setIsLoading(false);
  }
};
  //end of Sign in and Log in Modal and form validation

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("pro");

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navigation */}
      <Navbar
        onOpenModal={() => setShowModal(true)}
        isMenuOpen={isMenuOpen}
        toggleMenu={() => setIsMenuOpen(!isMenuOpen)}
      />

      {/* Modal for Sign In / Log In */}
      <AuthModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onAuthSuccess={(userData) => {
          setShowModal(false);
          // Handle successful authentication
          if (userData.role === 'admin') {
            navigate('/admin');
          } else if (localStorage.getItem('isNewSignup') === 'true') {
            navigate('/onboarding');
          } else {
            navigate('/dashboard');
          }
        }}
        isLogin={isLogin}
      />
      <RevealOnScroll>
        <HeroSection onOpenModal={() => setShowModal(true)} />
      </RevealOnScroll>
        <Features />
      <RevealOnScroll delay={0.2}>
        <Testimonials />
      </RevealOnScroll>
      <RevealOnScroll delay={0.3}>
        <Pricing />
      </RevealOnScroll>
      <RevealOnScroll>
        <CTA />
      </RevealOnScroll>
      <div className="w-full bg-black">
        <TextHoverEffect text="WorkFlow" duration={0.5} />
      </div>
      <Footer />
    </div>
  );
};

export default WorkFlowLanding;