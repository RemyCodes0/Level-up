import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Navbar } from "@/components/navbar/Navbar"
import { 
  BookOpen, 
  Clock, 
  DollarSign, 
  Star, 
  Users, 
  CheckCircle2, 
  ArrowRight, 
  GraduationCap,
  TrendingUp,
  Award,
  Sparkles,
  Zap,
  Shield
} from "lucide-react"
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"

export default function HomePage() {
  // const user = JSON.parse(localStorage.getItem("user"))
  const router = useNavigate()
  
  // useEffect(() => {
  //   if (user) {
  //     router("/dashboard")
  //   }
  // }, [user])

  const features = [
    {
      icon: DollarSign,
      title: "Affordable Rates",
      description: "Student-friendly pricing starting at $10/hour. Get quality tutoring without breaking the bank.",
      gradient: "from-emerald-500 to-teal-600",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600"
    },
    {
      icon: Users,
      title: "Verified Tutors",
      description: "All tutors are verified AUB students who have excelled in their subjects and passed our screening.",
      gradient: "from-blue-500 to-indigo-600",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600"
    },
    {
      icon: Clock,
      title: "Flexible Scheduling",
      description: "Book sessions that fit your schedule. Meet on campus or online based on your preference.",
      gradient: "from-purple-500 to-pink-600",
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600"
    },
    {
      icon: BookOpen,
      title: "Wide Subject Range",
      description: "From Computer Science to Biology, find tutors for all your courses across different majors.",
      gradient: "from-orange-500 to-red-600",
      iconBg: "bg-orange-100",
      iconColor: "text-orange-600"
    },
    {
      icon: Star,
      title: "Rated & Reviewed",
      description: "Read reviews from other students to find the perfect tutor match for your learning style.",
      gradient: "from-amber-500 to-yellow-600",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600"
    },
    {
      icon: CheckCircle2,
      title: "Easy Booking",
      description: "Simple, hassle-free booking process. Find, book, and pay for sessions all in one place.",
      gradient: "from-cyan-500 to-blue-600",
      iconBg: "bg-cyan-100",
      iconColor: "text-cyan-600"
    },
  ]

  const steps = [
    {
      number: 1,
      title: "Browse Tutors",
      description: "Search for tutors by subject, rating, or availability. View their profiles, rates, and reviews from other students.",
      icon: Users,
      gradient: "from-blue-500 to-indigo-600"
    },
    {
      number: 2,
      title: "Book a Session",
      description: "Choose a time that works for you and book your session. Specify your learning goals and any topics you want to cover.",
      icon: Calendar,
      gradient: "from-purple-500 to-pink-600"
    },
    {
      number: 3,
      title: "Learn & Grow",
      description: "Meet with your tutor on campus or online. After the session, leave a review to help other students find great tutors.",
      icon: TrendingUp,
      gradient: "from-emerald-500 to-teal-600"
    },
  ]

  const stats = [
    { label: "Active Students", value: "500+", icon: Users },
    { label: "Expert Tutors", value: "100+", icon: Award },
    { label: "Sessions Completed", value: "2000+", icon: CheckCircle2 },
    { label: "Subjects Covered", value: "50+", icon: BookOpen },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-blue-50/30 to-purple-50/30">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>

        <div className="container relative mx-auto px-4 py-20 md:py-32">
          <div className="max-w-5xl mx-auto text-center space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Badge variant="secondary" className="text-sm px-6 py-2 mb-6 bg-gradient-to-r from-blue-100 to-purple-100 border-0">
                <Sparkles className="h-3.5 w-3.5 mr-2 text-blue-600" />
                Peer-to-Peer Learning at AUB
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-5xl md:text-7xl font-bold tracking-tight text-balance"
            >
              <span className="bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent">
                Learn from Your Peers,
              </span>
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Excel in Your Studies
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg md:text-xl text-gray-600 text-balance max-w-3xl mx-auto leading-relaxed"
            >
              Connect with verified AUB student tutors for affordable, convenient, and effective one-on-one tutoring sessions.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 justify-center pt-4"
            >
              <a href="/tutors">
                <Button size="lg" className="text-base px-8 h-14 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all group">
                  Find a Tutor
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </a>
              <a href="/signup">
                <Button size="lg" variant="outline" className="text-base px-8 h-14 border-2 hover:bg-gray-50">
                  <GraduationCap className="mr-2 h-5 w-5" />
                  Become a Tutor
                </Button>
              </a>
            </motion.div>

            {/* Stats Bar */}
            {/* <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-12 max-w-4xl mx-auto"
            >
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="flex items-center justify-center mb-2">
                    <stat.icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    {stat.value}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">{stat.label}</div>
                </div>
              ))}
            </motion.div> */}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <Badge variant="outline" className="mb-4 px-4 py-1 text-blue-600 border-blue-200">
              <Zap className="h-3.5 w-3.5 mr-2" />
              Features
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              Why Choose Level Up?
            </h2>
            <p className="text-lg md:text-xl text-gray-600 text-balance max-w-2xl mx-auto">
              Peer tutoring designed specifically for AUB students
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-2 group h-full">
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
                  <div className={`absolute top-0 left-0 w-1 h-full bg-gradient-to-b ${feature.gradient}`} />
                  
                  <CardHeader className="p-6">
                    <div className={`${feature.iconBg} p-3 rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform duration-300`}>
                      <feature.icon className={`h-6 w-6 ${feature.iconColor}`} />
                    </div>
                    <CardTitle className="text-xl mb-2">{feature.title}</CardTitle>
                    <CardDescription className="text-base leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="container mx-auto px-4 py-20 md:py-32 bg-gradient-to-b from-blue-50/50 to-purple-50/50 rounded-3xl">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <Badge variant="outline" className="mb-4 px-4 py-1 text-purple-600 border-purple-200">
              <Shield className="h-3.5 w-3.5 mr-2" />
              Simple Process
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              How It Works
            </h2>
            <p className="text-lg md:text-xl text-gray-600">Get started in three simple steps</p>
          </motion.div>

          <div className="space-y-8">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
                className="relative"
              >
                <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group">
                  <div className={`absolute inset-0 bg-gradient-to-br ${step.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
                  
                  <div className="flex flex-col md:flex-row gap-6 items-start p-8">
                    <div className={`relative flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br ${step.gradient} flex items-center justify-center text-white text-2xl font-bold shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      {step.number}
                      <div className="absolute inset-0 rounded-2xl bg-white opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold mb-3 text-gray-900">{step.title}</h3>
                      <p className="text-gray-600 leading-relaxed text-lg">
                        {step.description}
                      </p>
                    </div>

                    <div className={`hidden md:block p-4 rounded-xl bg-gradient-to-br ${step.gradient} bg-opacity-10`}>
                      <step.icon className="h-8 w-8 text-gray-700" />
                    </div>
                  </div>
                </Card>

                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute left-8 top-full h-8 w-0.5 bg-gradient-to-b from-gray-300 to-transparent"></div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20 md:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Card className="relative overflow-hidden border-0 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600"></div>
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnptMCAyYy0yLjIxIDAtNCAxLjc5LTQgNHMxLjc5IDQgNCA0IDQtMS43OSA0LTQtMS43OS00LTQtNHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjA1Ii8+PC9nPjwvc3ZnPg==')] opacity-30"></div>
            
            <CardHeader className="relative max-w-4xl mx-auto text-center space-y-6 py-16 md:py-24 px-6">
              <Sparkles className="h-12 w-12 text-white/90 mx-auto mb-4" />
              <h2 className="text-4xl md:text-5xl font-bold text-white text-balance">
                Ready to Level Up Your Learning?
              </h2>
              <p className="text-xl text-white/90 text-balance max-w-2xl mx-auto leading-relaxed">
                Join hundreds of AUB students already improving their grades through peer tutoring.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
                <a href="/signup">
                  <Button size="lg" variant="secondary" className="text-base px-8 h-14 bg-white text-blue-600 hover:bg-gray-100 shadow-lg hover:shadow-xl transition-all font-semibold">
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
                <a href="/tutors">
                  <Button
                    size="lg"
                    variant="outline"
                    className="text-base px-8 h-14 bg-transparent border-2 border-white text-white hover:bg-white hover:text-blue-600 transition-all font-semibold"
                  >
                    <Users className="mr-2 h-5 w-5" />
                    Browse Tutors
                  </Button>
                </a>
              </div>
            </CardHeader>
          </Card>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-gradient-to-b from-gray-50 to-gray-100 py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
            <div>
              <div className="flex items-center gap-3 font-bold text-xl mb-4">
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 overflow-hidden p-2 rounded-xl shadow-lg">
                  <img src="/logo.png" alt="Level Up" className="h-10 w-10 object-cover rounded-lg" />
                </div>
                <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Level Up
                </span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                Peer tutoring platform for AUB students. Empowering academic excellence through collaborative learning.
              </p>
              <div className="flex gap-3 mt-4">
                <Badge variant="outline" className="text-xs">Trusted by 500+ students</Badge>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-gray-900">Platform</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <a href="/tutors" className="text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-2 group">
                    <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    Find Tutors
                  </a>
                </li>
                <li>
                  <a href="/become-tutor" className="text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-2 group">
                    <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    Become a Tutor
                  </a>
                </li>
                <li>
                  <a href="/how-it-works" className="text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-2 group">
                    <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    How It Works
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-gray-900">Support</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <a href="/faq" className="text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-2 group">
                    <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    FAQ
                  </a>
                </li>
                <li>
                  <a href="/contact" className="text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-2 group">
                    <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    Contact Us
                  </a>
                </li>
                <li>
                  <a href="/safety" className="text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-2 group">
                    <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    Safety Guidelines
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-gray-900">Legal</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <a href="/terms" className="text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-2 group">
                    <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="/privacy" className="text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-2 group">
                    <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    Privacy Policy
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-sm text-gray-600">
                &copy; 2025 Level Up. All rights reserved.
              </p>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Made with</span>
                <span className="text-red-500">❤️</span>
                <span>for AUB Students</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

function ChevronRight({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

function Calendar({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}