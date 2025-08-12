import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, User, Users, X } from 'lucide-react';

const AssignToDropdown = ({
  agentList = ["Me", "John Smith", "Anjali Roy", "Rahul Mehta", "Unassigned"],
  onAssign = (agent) => console.log(`Assigned to ${agent}`),
  currentAssignment = null
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleAssign = (agent) => {
    onAssign(agent);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
      >
        <span>
          {currentAssignment ? `Assigned to ${currentAssignment}` : 'Assign To'}
        </span>
        <ChevronDown 
          className={`ml-1 w-4 h-4 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`} 
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
          <div className="py-1">
            {agentList.map((agent, index) => (
              <button
                key={index}
                onClick={() => handleAssign(agent)}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-150 focus:outline-none focus:bg-gray-100 flex items-center"
              >
                {agent === 'Unassigned' ? (
                  <X className="w-4 h-4 mr-2 text-gray-500" />
                ) : agent === 'Me' ? (
                  <User className="w-4 h-4 mr-2 text-blue-500" />
                ) : (
                  <Users className="w-4 h-4 mr-2 text-gray-500" />
                )}
                {agent}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AssignToDropdown;
