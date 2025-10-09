import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

interface StarRatingProps {
  rating: number
  maxRating?: number
  size?: "sm" | "md" | "lg"
  showValue?: boolean
  className?: string
}

export function StarRating({ rating, maxRating = 5, size = "md", showValue = false, className }: StarRatingProps) {
  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {Array.from({ length: maxRating }).map((_, index) => {
        const starValue = index + 1
        const isFilled = starValue <= Math.round(rating)

        return (
          <Star
            key={index}
            className={cn(sizeClasses[size], isFilled ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30")}
          />
        )
      })}
      {showValue && <span className="ml-1 text-sm font-medium">{rating.toFixed(1)}</span>}
    </div>
  )
}
