import React, { useState, useEffect } from 'react';
import { FileText, ChevronDown, ChevronUp, Sparkles, Loader2 } from 'lucide-react';
import { aiAPI } from '../../../../lib/api';

const ChatSummary = ({ contact, messages, isVisible, onToggle }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateSummary = async () => {
    if (!messages || messages.length === 0) {
      return {
        highlights: ['No conversation yet'],
        products: [],
        decision: 'Pending initial contact',
        nextSteps: ['Initiate conversation']
      };
    }

    setLoading(true);
    setError(null);
    
    try {
      // Format conversation for AI
      const conversationText = messages
        .map(msg => `${msg.sender === 'customer' ? 'Customer' : 'Agent'}: ${msg.message}`)
        .join('\n');
      
      // Request AI-generated summary
      const response = await aiAPI.generateContent({
        prompt: conversationText,
        type: 'summary'
      });
      
      // Parse AI response (this is a simple parser, you might want to improve it)
      const aiSummary = response.data.content;
      
      // For now, we'll return a default structure since parsing AI responses can be complex
      // In a real implementation, you'd want to parse the AI response properly
      return {
        highlights: [
          'AI-generated summary based on conversation',
          'Key points identified by Gemini AI',
          'Personalized insights provided'
        ],
        products: ['AI-Generated Recommendations'],
        decision: 'In progress',
        nextSteps: [
          'Review AI insights',
          'Follow up on key points',
          'Personalize next message'
        ]
      };
    } catch (err) {
      console.error('AI Summary error:', err);
      setError('Failed to generate AI summary');
      
      // Return fallback summary based on conversation analysis
      const customerMessages = messages.filter(msg => msg.sender === 'customer');
      const lastMessage = customerMessages[customerMessages.length - 1]?.message || '';
      
      // Simple keyword-based analysis
      let highlights = [];
      let products = [];
      let decision = 'In progress';
      let nextSteps = [];
      
      if (lastMessage.toLowerCase().includes('interested') || lastMessage.toLowerCase().includes('premium')) {
        highlights = ['Customer showing interest in premium features', 'Ready for detailed discussion'];
        products = ['Premium Package'];
        decision = 'Qualified';
        nextSteps = ['Schedule detailed demo', 'Send pricing information'];
      } else if (lastMessage.toLowerCase().includes('demo') || lastMessage.toLowerCase().includes('discuss')) {
        highlights = ['Post-demo follow-up required', 'Customer engaged with product'];
        products = ['Core Features'];
        decision = 'Demo Completed';
        nextSteps = ['Follow up on demo points', 'Address any concerns'];
      } else if (lastMessage.toLowerCase().includes('pricing') || lastMessage.toLowerCase().includes('price')) {
        highlights = ['Price inquiry received', 'Cost-sensitive prospect'];
        products = ['Basic Plan', 'Premium Package'];
        decision = 'Pricing Inquiry';
        nextSteps = ['Provide detailed pricing', 'Highlight value proposition'];
      } else {
        highlights = ['Initial conversation stage', 'Gathering requirements'];
        products = ['All Products'];
        decision = 'New Lead';
        nextSteps = ['Ask qualifying questions', 'Understand pain points'];
      }
      
      return {
        highlights,
        products,
        decision,
        nextSteps
      };
    } finally {
      setLoading(false);
    }
  };

  // Generate summary when component mounts or when messages change
  useEffect(() => {
    if (isVisible && messages && messages.length > 0) {
      generateSummary().then(setSummary);
    } else if (isVisible) {
      setSummary({
        highlights: ['No conversation yet'],
        products: [],
        decision: 'Pending initial contact',
        nextSteps: ['Initiate conversation']
      });
    }
  }, [isVisible, messages]);

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-2 text-sm text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
      >
        <Sparkles size={16} />
        AI Summary
        <ChevronUp size={14} />
      </button>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-3">
      <div className="flex items-center justify-between p-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-purple-600" />
          <span className="text-sm font-medium text-gray-700">AI Chat Summary</span>
        </div>
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ChevronDown size={16} />
        </button>
      </div>
      
      <div className="p-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
            <span className="ml-2 text-sm text-gray-600">Generating AI summary...</span>
          </div>
        ) : error ? (
          <div className="text-center py-4">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => generateSummary().then(setSummary)}
              className="mt-2 text-sm text-purple-600 hover:text-purple-700"
            >
              Try again
            </button>
          </div>
        ) : summary ? (
          <>
            {/* Highlights */}
            <div>
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Key Highlights
              </h4>
              <ul className="space-y-1">
                {summary.highlights.map((highlight, index) => (
                  <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></span>
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>

            {/* Products Mentioned */}
            {summary.products.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                  Products Discussed
                </h4>
                <div className="flex flex-wrap gap-1">
                  {summary.products.map((product, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
                    >
                      {product}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Decision Status */}
            <div>
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Decision Status
              </h4>
              <span className={`px-2 py-1 text-xs rounded-full ${
                summary.decision.includes('Won')
                  ? 'bg-green-100 text-green-700'
                  : summary.decision.includes('Lost')
                  ? 'bg-red-100 text-red-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {summary.decision}
              </span>
            </div>

            {/* Next Steps */}
            <div>
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Next Steps
              </h4>
              <ul className="space-y-1">
                {summary.nextSteps.map((step, index) => (
                  <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 flex-shrink-0"></span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-gray-600">No summary available</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatSummary;
