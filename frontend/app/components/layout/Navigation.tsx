import { Form, Link, useLocation } from "@remix-run/react";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";

import { NAVIGATION_LINKS } from "~/constants/content";
import type { AuthUser } from "~/types/auth";
import { CartIcon } from "./CartIcon";
import { Button } from "~/components/ui/button";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { cn } from "~/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

function getInitials(user: AuthUser) {
  const first = (user.first_name || "").trim();
  const last = (user.last_name || "").trim();
  const letters = `${first[0] || ""}${last[0] || ""}`.toUpperCase();
  return letters || (user.email?.[0] ? user.email[0].toUpperCase() : "?");
}

export function Navigation({ user }: { user: AuthUser | null }) {
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const redirectTo = useMemo(
    () => `${location.pathname}${location.search}`,
    [location.pathname, location.search]
  );

  return (
    <nav
      className={cn(
        "fixed top-3 left-1/2 z-40 w-[min(calc(100%_-_2rem),80rem)] -translate-x-1/2",
        "rounded-2xl border border-border/10 bg-background/80 px-6 py-4 shadow-sm backdrop-blur-lg",
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <Link to="/" className="text-foreground font-bold text-xl tracking-tight">
            iPhone 17 Pro Max
          </Link>
        </motion.div>

        <ul className="hidden md:flex items-center gap-8">
          {NAVIGATION_LINKS.map((link, index) => (
            <motion.li
              key={link.to}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.4, ease: "easeOut" }}
            >
              <Link
                to={link.to}
                className="text-foreground/70 hover:text-foreground transition-colors text-sm font-medium"
              >
                <motion.span whileHover={reduceMotion ? undefined : { y: -1 }} className="inline-block">
                  {link.label}
                </motion.span>
              </Link>
            </motion.li>
          ))}
        </ul>

        <div className="flex items-center gap-6">
          <CartIcon />

          <Button asChild className="rounded-lg font-semibold">
            <Link to="/products">Shop</Link>
          </Button>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="px-2 rounded-lg">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{getInitials(user)}</AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium max-w-[220px] truncate">
                    {user.email}
                  </span>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-72 rounded-xl">
                <DropdownMenuLabel className="py-2">
                  <div className="font-semibold text-sm">
                    {user.first_name || user.last_name
                      ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
                      : user.email}
                  </div>
                  <div className="text-muted-foreground text-xs truncate">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Form method="post" action="/logout" className="w-full">
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <button type="submit" className="w-full text-left">
                      Logout
                    </button>
                  </Form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="ghost" className="rounded-lg">
              <Link to={`/login?redirectTo=${encodeURIComponent(redirectTo)}`}>Login</Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
