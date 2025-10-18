import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Navbar } from "@/components/navbar/Navbar"
import { BookOpen, Clock, DollarSign, Star, Users, CheckCircle2, ArrowRight, GraduationCap } from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <Badge variant="secondary" className="text-sm px-4 py-1">
            Peer-to-Peer Learning at AUB
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-balance">
            Learn from Your Peers, Excel in Your Studies
          </h1>
          <p className="text-sm text-muted-foreground text-balance max-w-2xl mx-auto leading-relaxed">
            Connect with verified AUB student tutors for affordable, convenient, and effective one-on-one tutoring
            sessions.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/tutors">
              <Button size="lg" className="text-base px-8">
                Find a Tutor
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
            <a href="/signup">
              <Button size="lg" variant="outline" className="text-base px-8 bg-transparent">
                Become a Tutor
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Why Choose Level Up?</h2>
            <p className="text-lg text-muted-foreground text-balance max-w-2xl mx-auto">
              Peer tutoring designed specifically for AUB students
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <div className="bg-primary/10 text-primary p-3 rounded-lg w-fit mb-2">
                  <DollarSign className="h-6 w-6" />
                </div>
                <CardTitle>Affordable Rates</CardTitle>
                <CardDescription>
                  Student-friendly pricing starting at $10/hour. Get quality tutoring without breaking the bank.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="bg-primary/10 text-primary p-3 rounded-lg w-fit mb-2">
                  <Users className="h-6 w-6" />
                </div>
                <CardTitle>Verified Tutors</CardTitle>
                <CardDescription>
                  All tutors are verified AUB students who have excelled in their subjects and passed our screening.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="bg-primary/10 text-primary p-3 rounded-lg w-fit mb-2">
                  <Clock className="h-6 w-6" />
                </div>
                <CardTitle>Flexible Scheduling</CardTitle>
                <CardDescription>
                  Book sessions that fit your schedule. Meet on campus or online based on your preference.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="bg-primary/10 text-primary p-3 rounded-lg w-fit mb-2">
                  <BookOpen className="h-6 w-6" />
                </div>
                <CardTitle>Wide Subject Range</CardTitle>
                <CardDescription>
                  From Computer Science to Biology, find tutors for all your courses across different majors.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="bg-primary/10 text-primary p-3 rounded-lg w-fit mb-2">
                  <Star className="h-6 w-6" />
                </div>
                <CardTitle>Rated & Reviewed</CardTitle>
                <CardDescription>
                  Read reviews from other students to find the perfect tutor match for your learning style.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="bg-primary/10 text-primary p-3 rounded-lg w-fit mb-2">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <CardTitle>Easy Booking</CardTitle>
                <CardDescription>
                  Simple, hassle-free booking process. Find, book, and pay for sessions all in one place.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-lg text-muted-foreground">Get started in three simple steps</p>
          </div>

          <div className="space-y-12">
            <div className="flex flex-col text-start md:flex-row gap-6 items-start">
              <div className="bg-primary text-primary-foreground rounded-full w-12 h-12 flex items-center justify-center text-xl font-bold flex-shrink-0">
                1
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Browse Tutors</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Search for tutors by subject, rating, or availability. View their profiles, rates, and reviews from
                  other students.
                </p>
              </div>
            </div>

            <div className="flex flex-col text-start md:flex-row gap-6 items-start">
              <div className="bg-primary text-primary-foreground rounded-full w-12 h-12 flex items-center justify-center text-xl font-bold flex-shrink-0">
                2
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Book a Session</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Choose a time that works for you and book your session. Specify your learning goals and any topics you
                  want to cover.
                </p>
              </div>
            </div>

            <div className="flex text-start flex-col md:flex-row gap-6 items-start">
              <div className="bg-primary text-primary-foreground rounded-full w-12 h-12 flex items-center justify-center text-xl font-bold flex-shrink-0">
                3
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Learn & Grow</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Meet with your tutor on campus or online. After the session, leave a review to help other students
                  find great tutors.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container rounded-2xl mx-auto px-4 py-20 bg-primary text-primary-foreground">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold text-balance">Ready to Level Up Your Learning?</h2>
          <p className="text-lg text-primary-foreground/90 text-balance">
            Join hundreds of AUB students already improving their grades through peer tutoring.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <a href="/signup">
              <Button size="lg" variant="secondary" className="text-base px-8">
                Get Started Free
              </Button>
            </a>
            <a href="/tutors">
              <Button
                size="lg"
                variant="outline"
                className="text-base px-8 bg-transparent border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary"
              >
                Browse Tutors
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 font-bold text-lg mb-4">
                 <div className="bg-primary text-primary-foreground p-2 rounded-full">
            <img src="/logo.png" alt="No image" className="h-10 w-10 rounded-full"/>
          </div>
                <span>Level Up</span>
              </div>
              <p className="text-sm text-muted-foreground">Peer tutoring platform for AUB students.</p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="/tutors" className="hover:text-foreground transition-colors">
                    Find Tutors
                  </a>
                </li>
                <li>
                  <a href="/become-tutor" className="hover:text-foreground transition-colors">
                    Become a Tutor
                  </a>
                </li>
                <li>
                  <a href="/how-it-works" className="hover:text-foreground transition-colors">
                    How It Works
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="/faq" className="hover:text-foreground transition-colors">
                    FAQ
                  </a>
                </li>
                <li>
                  <a href="/contact" className="hover:text-foreground transition-colors">
                    Contact Us
                  </a>
                </li>
                <li>
                  <a href="/safety" className="hover:text-foreground transition-colors">
                    Safety Guidelines
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="/terms" className="hover:text-foreground transition-colors">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="/privacy" className="hover:text-foreground transition-colors">
                    Privacy Policy
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2025 Level Up. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
