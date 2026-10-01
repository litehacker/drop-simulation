import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'primary' | 'quiet' | 'ghost'
}

export function Button({ tone = 'quiet', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`btn ${tone} ${className}`.trim()} {...props} />
}
