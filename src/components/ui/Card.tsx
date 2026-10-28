import { cn } from '@/lib/utils'
import { HTMLAttributes, forwardRef, useState } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  elevated?: boolean
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover = false, elevated = false, children, ...props }, ref) => {
    const [isHovered, setIsHovered] = useState(false)

    return (
      <div
        ref={ref}
        className={cn(
          'bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden',
          'transition-all duration-300 ease-spring',
          hover && 'hover:-translate-y-1 hover:shadow-xl cursor-pointer',
          elevated && 'shadow-lg hover:shadow-2xl',
          !hover && !elevated && 'shadow-sm',
          isHovered && 'shadow-xl -translate-y-1',
          className
        )}
        onMouseEnter={() => hover && setIsHovered(true)}
        onMouseLeave={() => hover && setIsHovered(false)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'
export default Card
