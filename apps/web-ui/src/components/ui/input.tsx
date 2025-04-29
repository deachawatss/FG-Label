import { InputHTMLAttributes, FC } from 'react';

export const Input: FC<InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input
    {...props}
    className={[
      'px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500',
      className,
    ].filter(Boolean).join(' ')}
  />
); 