import {
  type LucideIcon,
  Menu, X, ChevronDown, Moon, Sun, ArrowRight, Zap, Monitor, Smartphone, Cpu, Box, Code2, Database,
  Sparkles, Bot, MessageSquare, ScanEye, Compass, Briefcase, Layers, Glasses, Eye, GraduationCap,
  Building2, Landmark, Calendar, Mail, Phone, Globe, HeartPulse, ShoppingCart, Umbrella, Tractor,
  Share2, Plane, Hotel, Palette, Handshake, Users, UserPlus, UserCheck, Clock, Target, Newspaper,
  Workflow, BarChart3, FileSearch, TrendingUp, Plug, BrainCircuit, Megaphone, FileQuestion, Kanban,
  Filter, ShieldCheck, FileText, Headphones, Server, Cloud, GitBranch, Rocket, CheckCircle2,
  Lightbulb, Settings, Wrench, Package, Gauge, LineChart, PieChart, Wallet, CreditCard, Lock,
  Search, Star, Award, Heart, ThumbsUp, Smile, Coffee, Puzzle, Layers3, Boxes, Network, Cable,
  HardDrive, Terminal, GitPullRequest,
  Braces, Wifi, RefreshCw, PenTool, AlignLeft, BookOpen, Send, MapPin, AreaChart, Video, Link2, Activity,
  Camera, ScanFace, ImageIcon,
  MonitorPlay, FileSignature, ArrowLeftRight, Code, LifeBuoy, CalendarClock, Mic, Copyright, BadgeCheck, HelpCircle,
  AlertCircle, AppWindow, BedDouble, Bell, Blocks, CheckCircle, ClipboardCheck, ClipboardList, CloudRain, ConciergeBell,
  FileCheck, FolderGit2, HardHat, KeyRound, LayoutTemplate, Map, MapPinned, PackageSearch, Radar, Route, Satellite,
  ScanLine, Shield, Sprout, Trophy, Scale, ReceiptText, ShieldAlert,
  Globe2, Users2, Wand2, SquareTerminal, HeartHandshake,
  Archive, Cookie, Baby, XCircle, Gavel, Ban, Banknote, Bug, AlertTriangle,
  PlayCircle,
  Apple, Calculator, Shuffle, Timer, Building, Crown, LayoutDashboard, Laptop, Coins, PhoneCall,
  Gift, Download,
} from "lucide-react";

/**
 * String-keyed icon registry: CMS-stored config never holds a component
 * reference, only a key from this map (`config.icon`). `toProps` in the
 * section registry resolves it here. An unknown key falls back to a neutral
 * default rather than crashing the renderer.
 */
export const CMS_ICON_MAP: Record<string, LucideIcon> = {
  Menu, X, ChevronDown, Moon, Sun, ArrowRight, Zap, Monitor, Smartphone, Cpu, Box, Code2, Database,
  Sparkles, Bot, MessageSquare, ScanEye, Compass, Briefcase, Layers, Glasses, Eye, GraduationCap,
  Building2, Landmark, Calendar, Mail, Phone, Globe, HeartPulse, ShoppingCart, Umbrella, Tractor,
  Share2, Plane, Hotel, Palette, Handshake, Users, UserPlus, UserCheck, Clock, Target, Newspaper,
  Workflow, BarChart3, FileSearch, TrendingUp, Plug, BrainCircuit, Megaphone, FileQuestion, Kanban,
  Filter, ShieldCheck, FileText, Headphones, Server, Cloud, GitBranch, Rocket, CheckCircle2,
  Lightbulb, Settings, Wrench, Package, Gauge, LineChart, PieChart, Wallet, CreditCard, Lock,
  Search, Star, Award, Heart, ThumbsUp, Smile, Coffee, Puzzle, Layers3, Boxes, Network, Cable,
  HardDrive, Terminal, GitPullRequest,
  Braces, Wifi, RefreshCw, PenTool, AlignLeft, BookOpen, Send, MapPin, AreaChart, Video, Link2, Activity,
  Camera, ScanFace, ImageIcon,
  MonitorPlay, FileSignature, ArrowLeftRight, Code, LifeBuoy, CalendarClock, Mic, Copyright, BadgeCheck, HelpCircle,
  AlertCircle, AppWindow, BedDouble, Bell, Blocks, CheckCircle, ClipboardCheck, ClipboardList, CloudRain, ConciergeBell,
  FileCheck, FolderGit2, HardHat, KeyRound, LayoutTemplate, Map, MapPinned, PackageSearch, Radar, Route, Satellite,
  ScanLine, Shield, Sprout, Trophy, Scale, ReceiptText, ShieldAlert,
  Globe2, Users2, Wand2, SquareTerminal, HeartHandshake,
  Archive, Cookie, Baby, XCircle, Gavel, Ban, Banknote, Bug, AlertTriangle,
  PlayCircle,
  Apple, Calculator, Shuffle, Timer, Building, Crown, LayoutDashboard, Laptop, Coins, PhoneCall,
  Gift, Download,
};

export const CMS_ICON_KEYS = Object.keys(CMS_ICON_MAP).sort();
const DEFAULT_ICON = Sparkles;

/** Resolves a stored icon key to a real icon component; never throws. */
export function resolveIcon(key: string | null | undefined): LucideIcon {
  if (!key) return DEFAULT_ICON;
  return CMS_ICON_MAP[key] ?? DEFAULT_ICON;
}
