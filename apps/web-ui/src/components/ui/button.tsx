import { ButtonHTMLAttributes, FC } from 'react';

export const Button: FC<ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, ...props }) => (
  <button
    {...props}
    className={[
      'px-4 py-2 bg-blue-600 text-white rounded',
      className,
    ].filter(Boolean).join(' ')}
  />
); 