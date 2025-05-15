import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { PostgrestError } from '@supabase/supabase-js';
import { CheckCircle, XCircle, Mic, Send, Loader2, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { useSpring, animated } from '@react-spring/web';

interface Property {
  id: string;
  name: string;
  property_type: string;
  street_number: string;
  street_name: string;
  suburb: string;
  city: string;
  price: number;
  agent_name: string;
  agency_name: string;
  category: 'Listing' | 'Sold' | 'Under Offer';
  sale_type: 'Private Treaty' | 'Auction' | 'EOI';
  listed_date: string;
  sale_date: string | null;
}

interface EnquiryFormProps {
  property: Property;
  onClose: () => void;
}

export default function EnquiryForm({ property, onClose }: EnquiryFormProps) {
  const [enquiryData, setEnquiryData] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [validation, setValidation] = useState({
    name: false,
    email: false,
    phone: false,
    message: false,
  });
  const [aiSuggestion, setAiSuggestion] = useState('');
  const formRef = useRef<HTMLDivElement>(null);

  // Spring animation for form entrance
  const springProps = useSpring({
    from: { opacity: 0, transform: 'translateY(50px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
    config: { tension: 220, friction: 20 },
  });

  // Real-time validation with relaxed rules
  useEffect(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const timeout = setTimeout(() => {
      setValidation({
        name: enquiryData.name.trim().length > 0, // Relaxed to > 0
        email: emailRegex.test(enquiryData.email),
        phone: enquiryData.phone.trim().length > 0, // Relaxed to > 0
        message: enquiryData.message.trim().length > 0, // Relaxed to > 0
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [enquiryData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEnquiryData({ ...enquiryData, [name]: value });
  };

  // AI-powered message suggestion
  const generateAISuggestion = async () => {
    const prompts = [
      `I'm interested in ${property.name} at ${property.street_number} ${property.street_name}. Could you provide more details about the ${property.property_type}?`,
      `Hi ${property.agent_name}, I'd love to schedule a viewing for ${property.name}. When might be convenient?`,
      `Hello, can you tell me more about the ${property.category} property at ${property.street_name} listed for $${property.price}?`,
    ];
    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
    setAiSuggestion(randomPrompt);

    const suggestionInterval = setInterval(() => {
      setAiSuggestion((prev) => prev + '.');
    }, 200);
    setTimeout(() => {
      clearInterval(suggestionInterval);
      setEnquiryData({ ...enquiryData, message: randomPrompt });
      setAiSuggestion('');
    }, 1000);
  };

  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Speech recognition not supported in this browser.');
      return;
    }
    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setEnquiryData({ ...enquiryData, message: transcript });
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      alert('Voice input failed. Please try again.');
      setIsListening(false);
    };

    recognition.start();
  };

  const validateForm = () => {
    const isValid = Object.values(validation).every(Boolean);
    console.log('Form validation result:', isValid, validation);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('Form submission triggered with data:', enquiryData);

    if (!validateForm()) {
      alert('Please fill out all fields correctly.');
      console.log('Submission blocked due to invalid form');
      return;
    }

    setLoading(true);
    console.log('Loading set to true');

    try {
      console.log('Submitting enquiry to Supabase...');
      const { error: enquiryError } = await supabase.from('enquiries').insert([
        {
          property_id: property.id,
          property_name: property.name,
          name: enquiryData.name,
          email: enquiryData.email,
          phone: enquiryData.phone,
          message: enquiryData.message,
          agent_name: property.agent_name,
          created_at: new Date().toISOString(),
        },
      ]);

      if (enquiryError) {
        console.error('Enquiry insertion error:', enquiryError);
        throw enquiryError;
      }

      console.log('Submitting notification to Supabase...');
      const { error: notificationError } = await supabase.from('notifications').insert([
        {
          user_id: property.agent_name, // Adjust if user_id differs
          message: `New enquiry from ${enquiryData.name} for ${property.name}`,
          created_at: new Date().toISOString(),
          read: false,
        },
      ]);

      if (notificationError) {
        console.error('Notification insertion error:', notificationError);
        throw notificationError;
      }

      console.log('Submission successful');
      setSubmitted(true);
      confetti({
        particleCount: 150,
        spread: 90,
        colors: ['#4CAF50', '#2196F3', '#FFC107'],
        origin: { y: 0.5 },
      });

      setTimeout(() => {
        console.log('Closing form and resetting state');
        onClose();
        setSubmitted(false);
        setEnquiryData({ name: '', email: '', phone: '', message: '' });
      }, 2500);
    } catch (error) {
      const typedError = error as PostgrestError;
      console.error('Submission failed:', typedError.message || 'Unknown error');
      alert(`Failed to submit enquiry: ${typedError.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
      console.log('Loading reset to false');
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-black/70 to-blue-900/50 flex items-center justify-center z-50">
      <animated.div style={springProps} ref={formRef}>
        <motion.div
          className="bg-white/95 backdrop-blur-md p-6 rounded-2xl shadow-2xl max-w-md w-full border border-gray-100"
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          {submitted ? (
            <motion.div
              className="text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <h3 className="text-2xl font-bold text-green-600 mb-4 bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
                Enquiry Sent!
              </h3>
              <p className="text-gray-600">We'll connect you with {property.agent_name} shortly.</p>
            </motion.div>
          ) : (
            <>
              <h3 className="text-2xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Enquire: {property.name}
              </h3>
              <p className="text-gray-500 mb-6 text-sm">
                {property.street_number} {property.street_name}, {property.suburb}
              </p>
              <form onSubmit={handleSubmit} className="space-y-5">
                {['name', 'email', 'phone'].map((field) => (
                  <motion.div
                    key={field}
                    className="relative"
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                  >
                    <label className="block text-gray-700 text-sm mb-1 capitalize" htmlFor={field}>
                      Your {field}
                    </label>
                    <input
                      id={field}
                      name={field}
                      type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                      value={enquiryData[field as keyof typeof enquiryData]}
                      onChange={handleChange}
                      className={`w-full p-3 border rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 ${
                        !validation[field as keyof typeof validation] && enquiryData[field as keyof typeof enquiryData]
                          ? 'border-red-400'
                          : 'border-gray-200'
                      }`}
                      required
                    />
                    <motion.span
                      className="absolute right-3 top-11"
                      animate={{ scale: validation[field as keyof typeof validation] ? 1.1 : 1 }}
                    >
                      {validation[field as keyof typeof validation] ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : enquiryData[field as keyof typeof enquiryData] ? (
                        <XCircle className="w-5 h-5 text-red-500" />
                      ) : null}
                    </motion.span>
                  </motion.div>
                ))}
                <motion.div
                  className="relative"
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: 'spring', stiffness: 400 }}
                >
                  <label className="block text-gray-700 text-sm mb-1" htmlFor="message">
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    value={enquiryData.message}
                    onChange={handleChange}
                    className={`w-full p-3 border rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 ${
                      !validation.message && enquiryData.message ? 'border-red-400' : 'border-gray-200'
                    }`}
                    rows={4}
                    required
                    placeholder="Ask away or use our smart features..."
                  />
                  <div className="flex justify-between mt-2 gap-2">
                    <motion.button
                      type="button"
                      onClick={generateAISuggestion}
                      className="flex items-center text-blue-600 text-sm hover:text-blue-800"
                      whileTap={{ scale: 0.95 }}
                    >
                      <Sparkles className="w-4 h-4 mr-1" />
                      {aiSuggestion ? aiSuggestion : 'AI Suggest'}
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={handleVoiceInput}
                      className={`flex items-center ${isListening ? 'text-blue-600 animate-pulse' : 'text-gray-600 hover:text-blue-600'}`}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Mic className="w-4 h-4 mr-1" />
                      {isListening ? 'Listening...' : 'Voice'}
                    </motion.button>
                  </div>
                </motion.div>
                <motion.div
                  className="bg-gradient-to-r from-gray-50 to-blue-50 p-3 rounded-lg text-sm text-gray-600"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <p><strong>Agent Preview:</strong></p>
                  <p className="truncate">
                    "New enquiry from {enquiryData.name || 'You'} for {property.name}: {enquiryData.message || '[Your message]'}"
                  </p>
                </motion.div>
                <div className="flex justify-end space-x-3">
                  <motion.button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-all duration-200"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={loading}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="submit"
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-60 flex items-center transition-all duration-200"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={loading || !validateForm()}
                    onClick={() => console.log('Send Enquiry button clicked')}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5 mr-2" /> Send Enquiry
                      </>
                    )}
                  </motion.button>
                </div>
              </form>
            </>
          )}
        </motion.div>
      </animated.div>
    </div>
  );
}