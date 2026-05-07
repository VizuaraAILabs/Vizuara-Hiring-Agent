# Design Conventions

Living conventions for frontend UI work in this repository.

## Tailwind Classes

- Prefer canonical Tailwind utilities when a value maps exactly to the spacing, sizing, color, typography, or radius scale.
- Avoid arbitrary values when the canonical class is equivalent. For example, use `w-150 h-150` instead of `w-[600px] h-[600px]`, and `w-125 h-125` instead of `w-[500px] h-[500px]`.
- Use Tailwind's canonical gradient direction utilities. For example, use `bg-linear-to-b` instead of `bg-gradient-to-b`, and `bg-linear-to-r` instead of `bg-gradient-to-r`.
- Use canonical flex shorthands. For example, use `grow` instead of `flex-grow`, and `shrink-0` instead of `flex-shrink-0`.
- Use theme color tokens for brand and surface colors. For example, use `border-primary/20` instead of `border-[#00a854]/20`, `hover:bg-primary-light` instead of `hover:bg-[#00c96b]`, `text-accent` instead of `text-[#0099b8]`, and `bg-surface` instead of `bg-[#111]`.
- Use arbitrary values only when the design requires a value that is not represented by the scale, or when the utility is inherently custom, such as complex shadows, masks, gradients, and uncommon blur radii.
- Keep arbitrary values intentional and local. If the same custom value appears repeatedly, consider promoting it to a theme token or shared component style.

## Visual Consistency

- Preserve the existing ArcEval visual language: dark surfaces, restrained borders, green/teal accents, editorial serif headings, and compact recruiter-focused controls.
- UI text should fit cleanly across desktop and mobile. Do not rely on clipping or overflow to hide layout problems.
- For italic display text, leave enough inline render room for glyph overhangs so letters are not visibly clipped.
