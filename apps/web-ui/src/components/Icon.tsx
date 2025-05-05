import React from 'react';
import { IconType } from 'react-icons';

interface IconProps {
  icon: IconType;
  size?: number;
  className?: string;
}

export const Icon = ({ icon: IconComponent, size = 20, className = '' }: IconProps) => {
  return (
    <div className={`text-gray-600 ${className}`}>
      {React.createElement(IconComponent as React.ComponentType<{ size?: number }>, { size })}
    </div>
  );
}; 