# Level Up - Peer Tutoring Platform

Level Up is a comprehensive peer-to-peer tutoring platform designed specifically for AUB (American University of Beirut) students. The platform connects learners with qualified peer tutors across various subjects, making academic support more accessible, affordable, and convenient.

## 🎯 Overview

Level Up facilitates meaningful educational connections by allowing students to:
- **Find tutors** in their subjects of interest
- **Book tutoring sessions** at flexible times
- **Communicate directly** with tutors before committing
- **Leave reviews** to help future learners make informed decisions
- **Manage their learning journey** through an intuitive dashboard

## ✨ Features

### For Learners
- **Advanced Tutor Search**: Filter tutors by subject, price range, and ratings
- **Detailed Tutor Profiles**: View comprehensive information about tutors including their teaching approach, availability, and student reviews
- **Direct Messaging**: Contact tutors before booking to discuss learning goals and expectations
- **Session Booking**: Schedule tutoring sessions with date, time, and location preferences
- **Booking Management**: Track upcoming and past sessions in one place
- **Review System**: Rate and review tutors after completed sessions
- **Profile Management**: Update personal information and preferences

### For Tutors
- **Tutor Dashboard**: Overview of earnings, upcoming sessions, and performance metrics
- **Profile Management**: Edit bio, subjects, hourly rates, and teaching approach
- **Availability Scheduling**: Set weekly availability hours for each day
- **Session Management**: View and manage all tutoring sessions
- **Earnings Tracking**: Monitor total earnings, pending payments, and completed sessions
- **Message Inbox**: Communicate with potential and current students

### For Administrators
- **Admin Dashboard**: Platform-wide analytics and key metrics
- **Tutor Application Management**: Review and approve/reject tutor applications
- **User Management**: View, search, and manage all platform users
- **Session Oversight**: Monitor all tutoring sessions across the platform
- **Analytics**: Track platform growth, revenue, and user engagement metrics

## 🛠️ Tech Stack

- **Framework**: [React](https://react.dev/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Database**: SQL (Supabase/Neon/PostgreSQL compatible)
- **Authentication**: Mock auth system (ready for Supabase Auth integration)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. **Clone or download the project**
   \`\`\`bash
   # If using the shadcn CLI (recommended)
   npx shadcn@latest init
   
   # Or download the ZIP file from v0
   \`\`\`

2. **Install dependencies**
   \`\`\`bash
   npm install
   # or
   yarn install
   \`\`\`

3. **Set up the database** (Optional - uses mock data by default)
   
   If you want to use a real database:
   - Connect a Supabase, Neon, or PostgreSQL database
   - Run the SQL scripts in the `scripts/` folder:
     - `scripts/01-create-tables.sql` - Creates all necessary tables
     - `scripts/02-seed-data.sql` - Populates with sample data

4. **Run the development server**
   \`\`\`bash
   npm run dev
   # or
   yarn dev
   \`\`\`

5. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
level-up-platform/
├── app/                          # Next.js App Router pages
│   ├── admin/                    # Admin dashboard pages
│   │   ├── analytics/           # Platform analytics
│   │   ├── applications/        # Tutor application management
│   │   ├── dashboard/           # Admin overview
│   │   ├── sessions/            # Session oversight
│   │   └── users/               # User management
│   ├── book/                     # Session booking
│   │   └── [tutorId]/          # Book specific tutor
│   ├── bookings/                 # User's bookings management
│   ├── dashboard/                # User dashboard
│   ├── login/                    # Login page
│   ├── messages/                 # Messaging system
│   ├── profile/                  # User profile management
│   ├── signup/                   # Registration page
│   ├── tutor/                    # Tutor CMS
│   │   ├── availability/        # Manage availability
│   │   ├── dashboard/           # Tutor overview
│   │   ├── earnings/            # Earnings tracking
│   │   ├── profile/             # Edit tutor profile
│   │   └── sessions/            # Tutor's sessions
│   ├── tutors/                   # Tutor discovery
│   │   └── [id]/               # Individual tutor profile
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Landing page
│   └── globals.css              # Global styles
├── components/                   # Reusable components
│   ├── ui/                      # shadcn/ui components
│   ├── message-dialog.tsx       # Messaging dialog
│   ├── navbar.tsx               # Navigation bar
│   ├── review-dialog.tsx        # Review submission
│   ├── star-rating.tsx          # Star rating display
│   └── tutor-card.tsx           # Tutor card component
├── lib/                          # Utilities and helpers
│   ├── auth-context.tsx         # Authentication context
│   ├── mock-data.ts             # Mock data for development
│   ├── types.ts                 # TypeScript type definitions
│   └── utils.ts                 # Utility functions
├── scripts/                      # Database scripts
│   ├── 01-create-tables.sql    # Schema creation
│   └── 02-seed-data.sql        # Sample data
└── public/                       # Static assets
```

## 👥 User Roles

### Learner
- Default role for new users
- Can search and book tutors
- Can message tutors and leave reviews
- Access to personal dashboard and bookings

### Tutor
- Must apply and be approved by admin
- Can set availability and manage profile
- Receives bookings from learners
- Tracks earnings and sessions

### Admin
- Full platform access
- Manages tutor applications
- Oversees all users and sessions
- Views platform analytics

## 🗄️ Database Schema

### Users Table
- `id` (UUID, Primary Key)
- `email` (String, Unique)
- `name` (String)
- `role` (Enum: learner, tutor, admin)
- `avatar_url` (String, Optional)
- `created_at` (Timestamp)

### Tutor Profiles Table
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key → users.id)
- `bio` (Text)
- `subjects` (Array)
- `hourly_rate` (Decimal)
- `rating` (Decimal)
- `total_sessions` (Integer)
- `status` (Enum: pending, approved, rejected)
- `teaching_approach` (Text)
- `availability` (JSONB)

### Sessions Table
- `id` (UUID, Primary Key)
- `learner_id` (UUID, Foreign Key → users.id)
- `tutor_id` (UUID, Foreign Key → users.id)
- `subject` (String)
- `date` (Date)
- `time` (String)
- `duration` (Integer)
- `location` (String)
- `status` (Enum: upcoming, completed, cancelled)
- `total_cost` (Decimal)

### Reviews Table
- `id` (UUID, Primary Key)
- `session_id` (UUID, Foreign Key → sessions.id)
- `tutor_id` (UUID, Foreign Key → users.id)
- `learner_id` (UUID, Foreign Key → users.id)
- `rating` (Integer, 1-5)
- `comment` (Text)
- `created_at` (Timestamp)

### Messages Table
- `id` (UUID, Primary Key)
- `conversation_id` (UUID)
- `sender_id` (UUID, Foreign Key → users.id)
- `receiver_id` (UUID, Foreign Key → users.id)
- `content` (Text)
- `created_at` (Timestamp)
- `read` (Boolean)

## 🔐 Authentication

The current implementation uses a **mock authentication system** for development purposes. This allows you to test all features without setting up a real authentication provider.

### Mock Users

**Learner Account:**
- Email: `learner@aub.edu.lb`
- Password: `password123`

**Tutor Account:**
- Email: `tutor@aub.edu.lb`
- Password: `password123`

**Admin Account:**
- Email: `admin@aub.edu.lb`
- Password: `admin123`

### Production Authentication

For production, integrate with [Supabase Auth](https://supabase.com/docs/guides/auth):

1. Add Supabase integration in v0
2. Update `lib/auth-context.tsx` to use Supabase client
3. Replace mock authentication logic with real Supabase auth methods
4. Add middleware for protected routes

## 📖 Usage Guide

### As a Learner

1. **Sign up** with your AUB email
2. **Browse tutors** by clicking "Find Tutors"
3. **Filter** by subject, price, or rating
4. **View profiles** to see detailed information
5. **Send a message** to discuss your needs
6. **Book a session** when you find the right tutor
7. **Leave a review** after your session

### As a Tutor

1. **Apply** to become a tutor during signup
2. **Wait for approval** from admin
3. **Set up your profile** with subjects and rates
4. **Configure availability** for each day of the week
5. **Respond to messages** from potential students
6. **Manage sessions** through your dashboard
7. **Track earnings** and performance

### As an Admin

1. **Log in** with admin credentials
2. **Review applications** in the Applications tab
3. **Approve or reject** tutor applications
4. **Monitor users** and sessions
5. **View analytics** for platform insights
6. **Manage** any issues or disputes

## 🎨 Design System

### Colors
- **Primary**: Blue/Indigo (academic, trustworthy)
- **Accent**: Emerald (success, growth)
- **Neutrals**: Gray scale for text and backgrounds

### Typography
- **Headings**: Geist Sans (bold, clear)
- **Body**: Geist Sans (readable, modern)
- **Mono**: Geist Mono (code, data)

### Components
All UI components are built with shadcn/ui and fully customizable through Tailwind CSS.

## 🚧 Future Enhancements

### Phase 2 Features
- [ ] Real-time chat with WebSocket support
- [ ] Video call integration for online sessions
- [ ] Payment processing with Stripe
- [ ] Calendar integration (Google Calendar, Outlook)
- [ ] Mobile app (React Native)
- [ ] Email notifications for bookings and messages
- [ ] Advanced analytics for tutors
- [ ] Referral program
- [ ] Group tutoring sessions
- [ ] Resource sharing (documents, notes)

### Phase 3 Features
- [ ] AI-powered tutor recommendations
- [ ] Automated scheduling assistant
- [ ] Performance tracking for learners
- [ ] Certification system for tutors
- [ ] Multi-language support
- [ ] Integration with university LMS

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is built for educational purposes as part of the AUB student community initiative.

## 🆘 Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Contact the development team
- Check the documentation

## 🙏 Acknowledgments

- Built with [v0](https://v0.dev) by Vercel
- UI components from [shadcn/ui](https://ui.shadcn.com)
- Icons from [Lucide](https://lucide.dev)
- Inspired by the AUB student community

---

**Made with ❤️ for AUB students by AUB students**
