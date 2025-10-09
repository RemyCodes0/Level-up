import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Star, CheckCircle2, DollarSign } from "lucide-react"
import type { TutorWithProfile } from "@/lib/types"

interface TutorCardProps {
  tutor: TutorWithProfile
}

export function TutorCard({ tutor }: TutorCardProps) {
  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start gap-4 mb-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={tutor.avatarUrl || "/placeholder.svg"} alt={tutor.fullName} />
            <AvatarFallback>{tutor.fullName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-lg">{tutor.fullName}</h3>
              {tutor.profile.isVerified && <CheckCircle2 className="h-4 w-4 text-primary" title="Verified Tutor" />}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <div className="flex items-center">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 mr-1" />
                <span className="font-medium">{tutor.profile.averageRating.toFixed(1)}</span>
              </div>
              <span>•</span>
              <span>{tutor.profile.totalSessions} sessions</span>
            </div>
            <div className="flex items-center gap-1 text-sm font-semibold text-primary">
              <DollarSign className="h-4 w-4" />
              <span>{tutor.profile.hourlyRate.toFixed(2)}/hour</span>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{tutor.profile.bio}</p>

        <div className="flex flex-wrap gap-2">
          {tutor.profile.subjects.slice(0, 3).map((subject) => (
            <Badge key={subject} variant="secondary" className="text-xs">
              {subject}
            </Badge>
          ))}
          {tutor.profile.subjects.length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{tutor.profile.subjects.length - 3} more
            </Badge>
          )}
        </div>
      </CardContent>
      <CardFooter className="p-6 pt-0">
        <a href={`/tutors/${tutor.id}`} className="w-full">
          <Button className="w-full">View Profile</Button>
        </a>
      </CardFooter>
    </Card>
  )
}
