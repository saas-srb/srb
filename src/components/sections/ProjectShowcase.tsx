"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { FolderGit2 } from "lucide-react";

interface Project {
  title: ReactNode;
  description: string;
  skills: string[];
}

interface ProjectShowcaseProps {
  title: string;
  description?: ReactNode;
  projects: Project[];
  tone?: "default" | "muted";
}

export default function ProjectShowcase({ title, description, projects, tone = "default" }: ProjectShowcaseProps) {
  return (
    <section id="projects" className={`py-24 sm:py-32 relative ${tone === "muted" ? "bg-muted/10" : "bg-background"}`}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl mb-14"
        >
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-4">{title}</h2>
          {description && <p className="text-lg leading-8 text-muted-foreground">{description}</p>}
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: (i % 6) * 0.08 }}
              className="p-7 rounded-2xl bg-muted/20 border border-border/50 hover:border-primary/30 hover:-translate-y-1 transition-all duration-300 flex flex-col"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                <FolderGit2 className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-bold text-foreground mb-2 leading-snug">{project.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5 flex-1">{project.description}</p>
              <div className="flex flex-wrap gap-2">
                {project.skills.map((skill) => (
                  <span
                    key={skill}
                    className="text-xs font-semibold text-foreground bg-background border border-border/60 px-2.5 py-1 rounded-full"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
