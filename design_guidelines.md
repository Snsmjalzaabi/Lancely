{
  "product": {
    "name": "Lancely",
    "positioning": "Premium dark-mode freelancer management SaaS for UAE (clients, quotations, invoices, projects, reminders, VAT, analytics)",
    "brand_attributes": [
      "premium",
      "calm",
      "trustworthy",
      "fast",
      "detail-oriented",
      "UAE-business appropriate"
    ],
    "north_star": "Help freelancers get paid faster with fewer admin steps"
  },
  "visual_personality": {
    "style_fusion": [
      "Linear-like dark surfaces + crisp typography",
      "Stripe dashboard clarity for finance tables",
      "Notion-like sidebar information architecture",
      "Warm UAE sand accents (subtle, premium)"
    ],
    "do_not": [
      "No gaming/neon cyberpunk look",
      "No purple (especially not for AI/automation cues)",
      "No heavy gradients; keep gradients decorative and under 20% viewport",
      "No centered app container layouts"
    ]
  },
  "typography": {
    "google_fonts_import": "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Figtree:wght@400;500;600;700&display=swap');",
    "font_families": {
      "display": "Space Grotesk, ui-sans-serif, system-ui",
      "body": "Figtree, ui-sans-serif, system-ui",
      "mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    },
    "usage": {
      "app_shell": "body uses body font; headings and KPI numbers use display font",
      "numbers": "Use tabular-nums for currency and totals: className='tabular-nums'"
    },
    "type_scale_tailwind": {
      "h1": "text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight",
      "h2": "text-base md:text-lg font-medium text-muted-foreground",
      "section_title": "text-lg font-semibold tracking-tight",
      "kpi_value": "text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums",
      "body": "text-sm sm:text-base",
      "small": "text-xs text-muted-foreground"
    }
  },
  "design_tokens": {
    "notes": "Dark theme only. Apply .dark on <html> or <body> at app bootstrap.",
    "css_custom_properties": {
      "recommended_location": "/app/frontend/src/index.css",
      "tokens": {
        "--background": "215 35% 6%",
        "--foreground": "210 25% 96%",
        "--card": "215 28% 10%",
        "--card-foreground": "210 25% 96%",
        "--popover": "215 28% 10%",
        "--popover-foreground": "210 25% 96%",
        "--primary": "188 78% 40%",
        "--primary-foreground": "210 25% 96%",
        "--secondary": "215 20% 14%",
        "--secondary-foreground": "210 25% 96%",
        "--muted": "215 18% 16%",
        "--muted-foreground": "215 12% 70%",
        "--accent": "34 26% 71%",
        "--accent-foreground": "215 35% 8%",
        "--destructive": "0 72% 52%",
        "--destructive-foreground": "210 25% 96%",
        "--border": "215 18% 22%",
        "--input": "215 18% 22%",
        "--ring": "188 78% 40%",
        "--radius": "0.9rem",
        "--shadow-elev-1": "0 1px 0 rgba(255,255,255,0.04), 0 10px 30px rgba(0,0,0,0.35)",
        "--shadow-elev-2": "0 1px 0 rgba(255,255,255,0.06), 0 18px 50px rgba(0,0,0,0.45)",
        "--noise-opacity": "0.06"
      },
      "hex_reference": {
        "bg": "#0B0F14",
        "surface": "#121820",
        "surface_2": "#0F151D",
        "border": "#2F3A48",
        "text": "#E2E8F0",
        "muted": "#94A3B8",
        "primary_teal": "#0E7490",
        "accent_sand": "#C9B59A",
        "success": "#22C55E",
        "warning": "#F59E0B",
        "danger": "#EF4444"
      }
    },
    "spacing_scale": {
      "rule": "Use 2–3x more spacing than feels comfortable; prefer 24/32/40 gaps in desktop layouts.",
      "tailwind": {
        "xs": "gap-2 p-2",
        "sm": "gap-3 p-3",
        "md": "gap-4 p-4",
        "lg": "gap-6 p-6",
        "xl": "gap-8 p-8"
      }
    },
    "radius": {
      "app_default": "rounded-xl",
      "cards": "rounded-2xl",
      "inputs": "rounded-lg",
      "badges": "rounded-full"
    }
  },
  "layout": {
    "grid": {
      "app_shell": "Desktop: 280px sidebar + fluid content. Mobile: top bar + sheet sidebar.",
      "content_max_width": "max-w-[1280px] (only for inner content blocks; do not center the entire app container)",
      "page_padding": "px-4 sm:px-6 lg:px-8 py-6",
      "kpi_grid": "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4",
      "forms": "grid grid-cols-1 lg:grid-cols-12 gap-6 (main form lg:col-span-8, preview lg:col-span-4)"
    },
    "navigation": {
      "sidebar": {
        "desktop": "Sticky left sidebar with grouped nav sections (Workspace, Finance, Operations, Settings)",
        "mobile": "Use shadcn Sheet for sidebar; hamburger in top bar",
        "active_state": "Left accent bar + subtle background tint; icon and label brighten"
      },
      "topbar": {
        "elements": [
          "Page title + breadcrumb",
          "Global search (Command palette)",
          "Create button (Quotation/Invoice)",
          "User menu (Dropdown)"
        ]
      }
    }
  },
  "components": {
    "component_path": {
      "shadcn_primary": "/app/frontend/src/components/ui",
      "use": [
        "button.jsx",
        "card.jsx",
        "badge.jsx",
        "table.jsx",
        "input.jsx",
        "textarea.jsx",
        "select.jsx",
        "dialog.jsx",
        "drawer.jsx",
        "sheet.jsx",
        "dropdown-menu.jsx",
        "tabs.jsx",
        "separator.jsx",
        "scroll-area.jsx",
        "command.jsx",
        "calendar.jsx",
        "sonner.jsx",
        "skeleton.jsx",
        "avatar.jsx",
        "tooltip.jsx"
      ]
    },
    "app_shell_patterns": {
      "surface_treatment": "Cards use bg-card with 1px border-border and shadow via [box-shadow:var(--shadow-elev-1)].",
      "hairline_dividers": "Use Separator with opacity-60; avoid thick borders.",
      "noise_overlay": {
        "purpose": "Premium texture; prevents flat dark UI",
        "implementation": "Add a fixed pseudo-element overlay on main background only (not on cards): bg noise at opacity var(--noise-opacity)."
      }
    },
    "buttons": {
      "variants": {
        "primary": "Use Button default variant but override with className='bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring'",
        "secondary": "variant='secondary' + className='hover:bg-secondary/80'",
        "ghost": "variant='ghost' + className='hover:bg-muted/60'",
        "danger": "variant='destructive' + className='hover:bg-destructive/90'"
      },
      "shape_motion": {
        "shape": "Rounded (8–12px) premium SaaS",
        "press": "active:scale-[0.98]",
        "hover": "hover:translate-y-[-1px] (only on primary CTAs), hover shadow intensifies",
        "transition": "transition-colors duration-200 (never transition-all)"
      },
      "data_testid_examples": [
        "data-testid='login-form-submit-button'",
        "data-testid='invoice-create-submit-button'",
        "data-testid='sidebar-create-quotation-button'"
      ]
    },
    "status_badges": {
      "rule": "Color is semantic only. Use subtle tinted backgrounds on dark.",
      "variants": {
        "paid": "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30",
        "unpaid": "bg-amber-500/15 text-amber-200 border border-amber-500/30",
        "overdue": "bg-red-500/15 text-red-200 border border-red-500/30",
        "draft": "bg-slate-500/15 text-slate-200 border border-slate-500/30",
        "active_project": "bg-cyan-500/15 text-cyan-200 border border-cyan-500/30",
        "completed_project": "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30"
      },
      "component": "Use <Badge> with className overrides; keep rounded-full and px-2.5 py-0.5"
    },
    "tables": {
      "pattern": "Operational tables (Clients/Invoices/Quotations) use shadcn Table with sticky header and row hover.",
      "classes": {
        "wrapper": "rounded-2xl border border-border bg-card overflow-hidden",
        "header": "bg-muted/40",
        "row": "hover:bg-muted/30 transition-colors",
        "cell": "py-3",
        "numeric": "text-right tabular-nums"
      },
      "row_actions": "Use DropdownMenu for row actions (View, Edit, Convert, Mark Paid)."
    },
    "forms": {
      "pattern": "Use shadcn Form primitives; group fields into Cards with clear section titles.",
      "inputs": {
        "base": "bg-background/40 border-border focus-visible:ring-ring",
        "helper_text": "text-xs text-muted-foreground",
        "error": "text-xs text-red-300"
      },
      "line_items": {
        "layout": "Each line item row is a grid: description (6fr), qty (2fr), rate (2fr), amount (2fr), remove icon.",
        "classes": "grid grid-cols-12 gap-3 items-end",
        "micro_interaction": "On add/remove, animate height/opacity with Framer Motion (optional)."
      },
      "vat_preview_card": {
        "content": [
          "Subtotal",
          "VAT 5%",
          "Grand total",
          "Currency: AED"
        ],
        "classes": "sticky top-6 rounded-2xl border border-border bg-card p-5 [box-shadow:var(--shadow-elev-1)]"
      }
    },
    "drawers_modals": {
      "clients": "Use Drawer on mobile, Dialog on desktop for Add/Edit Client.",
      "projects": "Use Dialog for Add/Edit Project; include Calendar for deadline.",
      "pdf_actions": "Use Dialog confirmation for 'Convert to Invoice' and 'Mark Paid'."
    },
    "cards": {
      "kpi_card": {
        "structure": [
          "Label (muted)",
          "Value (display font)",
          "Delta chip (optional)",
          "Mini sparkline (optional)"
        ],
        "classes": "rounded-2xl border border-border bg-card p-5 [box-shadow:var(--shadow-elev-1)]"
      },
      "attention_widget": {
        "purpose": "Overdue invoices / upcoming reminders",
        "classes": "rounded-2xl border border-border bg-card p-5",
        "rows": "Use compact list rows with status dot + invoice id + amount + due date"
      }
    },
    "empty_states": {
      "pattern": "Centered within content area (not whole page). Use icon + title + 1 sentence + primary CTA.",
      "classes": "rounded-2xl border border-dashed border-border bg-card/40 p-10",
      "copy_examples": {
        "clients": "No clients yet. Add your first client to start creating quotations.",
        "invoices": "No invoices yet. Create an invoice and track payment status in one place."
      }
    }
  },
  "pages": {
    "auth": {
      "login_register_layout": "Split layout on desktop: left brand panel (subtle gradient + noise) and right form card. On mobile: single column with brand header.",
      "brand_panel": {
        "headline": "Lancely",
        "subcopy": "Clients, invoices, VAT, and reminders — built for UAE freelancers.",
        "decor": "Use a mild background gradient only in this panel (<=20% viewport): from bg to muted with a teal glow blob."
      },
      "form_card": {
        "classes": "rounded-2xl border border-border bg-card p-6 sm:p-8 [box-shadow:var(--shadow-elev-2)]",
        "fields": [
          "Email",
          "Password",
          "Name (register)",
          "Business name (register)"
        ],
        "cta": "Primary button full width; secondary link for switching login/register",
        "data_testids": [
          "data-testid='login-email-input'",
          "data-testid='login-password-input'",
          "data-testid='register-business-name-input'"
        ]
      }
    },
    "dashboard": {
      "sections": [
        "KPI grid (4 cards)",
        "Monthly earnings chart (Area/Bar)",
        "Needs attention widget (overdue invoices)",
        "Recent activity (optional)"
      ],
      "chart_card": "Use Card with header row: title + timeframe tabs (30d/90d/YTD)."
    },
    "clients": {
      "primary_view": "Table view with optional compact grid toggle.",
      "client_row": "Avatar initials + name/company, TRN badge, email/phone, quick actions.",
      "add_edit": "Drawer/Dialog with sections: Identity, Contact, VAT/TRN, Notes."
    },
    "quotations": {
      "list": "Table with status (Draft/Sent/Accepted), client, total AED, created date.",
      "create": "Form + VAT preview side card; include line items; PDF download; Convert to Invoice action."
    },
    "invoices": {
      "list": "Table with status badges (Paid/Unpaid/Overdue), due date urgency indicator, total AED.",
      "create": "Same structure as quotation; include Mark Paid action and payment date.",
      "reminders": "Inline reminder chip for due soon/overdue."
    },
    "projects": {
      "view": "List with status badge + deadline chip + value AED; optional board via Tabs.",
      "urgency": "Deadline within 7 days shows amber dot; overdue shows red dot."
    },
    "payments": {
      "layout": "Three stacked sections: Upcoming, Overdue, Paid. Each section is a Card with list rows.",
      "row": "Invoice id + client + amount + due date + action (Send reminder)."
    },
    "settings": {
      "sections": [
        "Profile",
        "Business info for PDFs (name, TRN, address)",
        "Logo upload (optional)"
      ],
      "pattern": "Use Tabs for Profile/Business/Billing (future)."
    }
  },
  "charts_recharts": {
    "library": "recharts",
    "styling": {
      "grid": "stroke='hsl(var(--border))' strokeOpacity={0.6}",
      "axis": "tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false}",
      "tooltip": "Use custom tooltip with bg-card, border-border, shadow-elev-1, rounded-xl",
      "series_colors": {
        "earnings": "hsl(var(--primary))",
        "secondary": "hsl(var(--accent))"
      },
      "area_fill": "Use a very subtle fill: fill='hsl(var(--primary))' fillOpacity={0.12} (no gradients unless extremely subtle)"
    },
    "empty_state": "If no data, show skeleton chart + helper text instead of empty axes."
  },
  "motion_microinteractions": {
    "principles": [
      "Fast and subtle: 150–220ms",
      "Use opacity/translate for entrances; avoid large bouncy motion",
      "Respect prefers-reduced-motion"
    ],
    "recommended_library": {
      "name": "framer-motion",
      "install": "npm i framer-motion",
      "usage": "Animate page transitions (opacity + y: 6) and list insert/remove for line items."
    },
    "hover_states": {
      "cards": "hover:border-foreground/10 hover:bg-card/95",
      "table_rows": "hover:bg-muted/30",
      "sidebar_items": "hover:bg-muted/40"
    },
    "scroll": {
      "sticky": "Use sticky topbar and sticky VAT preview card",
      "shadow_on_scroll": "Topbar adds subtle shadow when scrolled (use state + class toggle)"
    }
  },
  "accessibility": {
    "contrast": "Ensure AA contrast for text on dark surfaces; avoid low-contrast gray-on-gray.",
    "focus": "Always visible focus ring: focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
    "keyboard": "All menus, dialogs, drawers must be keyboard navigable (shadcn defaults).",
    "reduced_motion": "Wrap motion with prefers-reduced-motion checks; keep essential state changes without animation."
  },
  "content_formatting": {
    "currency": {
      "standard": "AED 1,234.50",
      "implementation_hint": "Use Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED' })",
      "arabic_symbol_note": "If using د.إ, keep it consistent across UI and PDFs; default to 'AED' for clarity in English UI."
    },
    "vat": {
      "rate": 0.05,
      "labels": [
        "Subtotal",
        "VAT (5%)",
        "Total"
      ]
    }
  },
  "testing_attributes": {
    "rule": "All interactive and key informational elements MUST include data-testid (kebab-case).",
    "coverage_examples": {
      "sidebar": [
        "sidebar-nav-dashboard",
        "sidebar-nav-clients",
        "sidebar-nav-invoices",
        "sidebar-nav-quotations",
        "sidebar-nav-projects",
        "sidebar-nav-payments",
        "sidebar-nav-settings"
      ],
      "kpis": [
        "kpi-total-revenue",
        "kpi-unpaid-invoices",
        "kpi-overdue-invoices",
        "kpi-active-projects"
      ],
      "tables": [
        "clients-table",
        "invoices-table",
        "quotations-table"
      ],
      "actions": [
        "invoice-row-actions-menu",
        "invoice-mark-paid-button",
        "quotation-convert-to-invoice-button",
        "send-payment-reminder-button"
      ]
    }
  },
  "image_urls": {
    "notes": "Dashboard app is mostly UI-driven; keep imagery minimal. Use abstract textures only in auth/empty states.",
    "categories": [
      {
        "category": "auth_background_texture",
        "description": "Subtle dark texture for login/register left panel (avoid loud gradients).",
        "urls": []
      },
      {
        "category": "empty_state_illustrations",
        "description": "Minimal monochrome/line illustrations (optional). Prefer inline SVG icons from lucide-react instead of heavy images.",
        "urls": []
      }
    ]
  },
  "instructions_to_main_agent": {
    "theme": [
      "Force dark theme: add class 'dark' to <html> or <body> at app start; do not implement light theme toggle.",
      "Replace current :root tokens in index.css with the provided dark-first tokens (or set them under .dark and ensure .dark is always present).",
      "Remove/avoid App.css centered header styles; do not use .App { text-align:center } patterns."
    ],
    "implementation_priorities": [
      "Build AppShell first (Sidebar + Topbar + content outlet) with responsive Sheet sidebar.",
      "Implement KPI cards + tables + status badges as reusable components.",
      "Implement Quotation/Invoice form with line items + sticky VAT preview card.",
      "Add recharts styling + custom tooltip.",
      "Add data-testid to every interactive element and key info display."
    ],
    "component_conventions_js": [
      "This repo uses .jsx/.js (not .tsx). Keep components in JS and use named exports for components.",
      "Pages default export."
    ]
  },
  "general_ui_ux_design_guidelines_appendix": "<General UI UX Design Guidelines>\n    - You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms\n    - You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text\n   - NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json\n\n **GRADIENT RESTRICTION RULE**\nNEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc\nNEVER use dark gradients for logo, testimonial, footer etc\nNEVER let gradients cover more than 20% of the viewport.\nNEVER apply gradients to text-heavy content or reading areas.\nNEVER use gradients on small UI elements (<100px width).\nNEVER stack multiple gradient layers in the same viewport.\n\n**ENFORCEMENT RULE:**\n    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors\n\n**How and where to use:**\n   • Section backgrounds (not content backgrounds)\n   • Hero section header content. Eg: dark to light to dark color\n   • Decorative overlays and accent elements only\n   • Hero section with 2-3 mild color\n   • Gradients creation can be done for any angle say horizontal, vertical or diagonal\n\n- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**\n\n</Font Guidelines>\n\n- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead. \n   \n- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.\n\n- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.\n   \n- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly\n    Eg: - if it implies playful/energetic, choose a colorful scheme\n           - if it implies monochrome/minimal, choose a black–white/neutral scheme\n\n**Component Reuse:**\n\t- Prioritize using pre-existing components from src/components/ui when applicable\n\t- Create new components that match the style and conventions of existing components when needed\n\t- Examine existing components to understand the project's component patterns before creating new ones\n\n**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component\n\n**Best Practices:**\n\t- Use Shadcn/UI as the primary component library for consistency and accessibility\n\t- Import path: ./components/[component-name]\n\n**Export Conventions:**\n\t- Components MUST use named exports (export const ComponentName = ...)\n\t- Pages MUST use default exports (export default function PageName() {...})\n\n**Toasts:**\n  - Use `sonner` for toasts\"\n  - Sonner component are located in `/app/src/components/ui/sonner.tsx`\n\nUse 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals.\n</General UI UX Design Guidelines>"
}
