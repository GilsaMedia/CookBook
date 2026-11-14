# PRD — ספר המתכונים (Family Cookbook)

**Version:** 2.0 draft (Nov 2026). Replaces v1.2: the app now serves any family, not one owner.
**Companion docs:** `docs/PLAN.md` (stack, data model, build order, Claude Code prompts), `CLAUDE.md` (coding rules).

> Items marked **⚠️ TODO (family)** need the family's real data. Suggested values are there so work can continue, but Prompt 2 seeds the categories from Appendix A and Prompt 5 checks the import against them, so confirm those before running Prompt 2.

---

## 1. Problem and vision

The family's recipes live in one long Google Doc (191 recipes in 11 categories), written by Efrat. They were originally in Google Keep, and the move to the Doc lost the photos and labels. The Doc works: it has a category index with counts, a "↑ back to contents" link under every recipe, an "add to meal via WhatsApp" link, and a source link. But on a phone in the kitchen it falls short:

- Finding a recipe means scrolling or using browser search, which doesn't handle Hebrew plurals ("גזרים" doesn't find "גזר").
- Planning a Friday meal means opening 6 recipes and writing the shopping list by hand, adding up the same ingredient across dishes.
- While cooking, the screen locks, the text is small, and there's no way to mark what's already in the pot.
- Sharing means sharing the whole Doc. There's no way to give one person access and take it back.

**Vision:** a private, Hebrew-first cookbook app on the home screen. Find any recipe in seconds, turn a set of dishes into one shopping list in a tap, and cook from a screen that stays on and is readable from across the counter. Any family can sign up and bring their own collection.

## 2. Users, roles and privacy

| Role | Who | Can |
|---|---|---|
| **Owner** | The person who created the book (in our family: Efrat) | Everything: add, edit, delete, invite, revoke, export, set preferences |
| **Viewer** | Someone the owner invited | Read the book: library, recipes, cook mode, their own meals and shopping lists. No add, edit or delete controls |
| **Contributor** (Phase 2) | A viewer the owner explicitly marked | Everything a viewer can, plus suggest recipes, which wait for the owner's approval (§13.2) |

Rules:
- **A book is private by default.** Nobody sees it unless the owner invited them personally.
- **No public links, ever.** An invite is for one email address, works once, and expires after 7 days. The invitee must sign in with that exact email.
- **Revoking is immediate.** On the next request, a revoked person sees nothing from the book.
- A person can own one book and be a viewer in others (a daughter keeps her own book and still sees her mom's). With access to several books, a book switcher appears in the header.
- Each book has exactly one owner.

## 3. Goals and success metrics

**Phase 1 (our family):**
- All of Efrat's recipes are imported, in the right categories, with duplicates resolved.
- The **Friday flow** works from the iPhone home screen without help: pick 6 dishes → generate the shopping list → swap one dish → cook one recipe in cook mode.
- Efrat stops opening the Google Doc.

**Before opening to other families:** a new family can import their collection (Doc/PDF or Keep) in one sitting, and at least half of the owners invite at least one person.

**Not goals for now:** user-count targets, monetization, social features, public recipe pages.

## 4. Scope and phases

| Phase | Scope |
|---|---|
| **MVP (Phase 1)** | Library and recipe page (§5), adding recipes from URL or pasted text with a review step (§7, §13.3), bulk import from Doc/PDF and Keep (§7.3), meals and smart shopping list (§8), cook mode (§14), sharing and export (§9), excluded-ingredient warnings (§10) |
| **Phase 2** | Serving scaling, personal versions, favorites, notes, "worked / didn't work" (§13.4); contributors and approval inbox (§13.2); rule-based menu builder (§13.1); photo/OCR import; search by ingredient; free tags |
| **Phase 3** | Timers in steps, diet filters, advanced menu builder (oven and burner clashes), WhatsApp sharing and notifications, print views, offline book, weekly planning |

## 5. Library and recipes

### 5.1 Library (screen 1)

- **Search field** at the top. Results update as you type (within 150 ms). Search covers recipe titles and ingredient names, and handles Hebrew forms: plurals ("גזרים" finds "גזר"), final letters (ם/מ, ן/נ, ך/כ, ף/פ, ץ/צ), niqqud, and small typos.
- **Category chips** below search, scrolling sideways, each with its recipe count (e.g. "מרקים 14"). One tap filters; tapping again clears.
- **Card grid:** 2 columns on phone, 3–4 on tablet. Each card shows the image (or a placeholder), the title, and "category · total time".
- Cards with an excluded ingredient show a warning chip (§10).
- Every card has a quick "+" to add it to the current meal (§8.1).
- **Empty book:** a single "הוספת מתכון" button.

### 5.2 Recipe page (screen 2)

- Hero image, title, chips (category, tags, total time), servings.
- **Source line** "מקור: <name>" linking to the original (opens in a new tab). Every recipe that came from somewhere keeps its source.
- Primary button **"הוספה לארוחה +"**, secondary **"מצב בישול"**.
- Ingredient list, as written ("3 גזרים, פרוסים").
- Numbered steps.
- Warning chip if it contains an excluded ingredient (§10).
- Owner sees edit and delete. Edits save immediately; there is no "save" button and no unsaved draft. Delete asks for confirmation.

### 5.3 Recipe fields

Title, category, image(s), source name, source URL, servings, prep time, cook time, ingredients (§6), steps, and these menu-builder fields (filled automatically on import, editable): see §13.5.

## 6. Ingredients and store sections

Each ingredient is stored twice: the **display text** exactly as the recipe writes it, and **parsed fields** used for shopping lists and search:

| Field | Example |
|---|---|
| display text | "3 גזרים, פרוסים" |
| quantity | 3 |
| unit | יח׳ (metric base: g, ml or unit, see §8.3) |
| canonical name | גזר (singular, no adjectives) |
| store section | ירקות ופירות |
| optional | false (true for "לקישוט", "אופציונלי") |

Parsing happens once, when the recipe is saved, not when a list is built.

**Store sections** (the fixed list ingredients are assigned to). Each book can reorder them to match the way its family walks its supermarket; this order is the order of the shopping list.

**⚠️ TODO (family): confirm the sections and put them in the order you walk your supermarket.** Suggested default:

1. ירקות ופירות
2. לחם ומאפים
3. מוצרי חלב וביצים
4. בשר, עוף ודגים
5. קפואים
6. שימורים, רטבים וממרחים
7. יבשים (פסטה, אורז, קטניות, דגנים)
8. אפייה (קמח, סוכר, שמרים)
9. תבלינים ושמנים
10. אגוזים ופירות יבשים
11. משקאות
12. אחר

## 7. Adding recipes

Every way of adding a recipe ends at the same **review screen** (§13.3) before anything is saved. Recipes the owner adds are visible immediately.

### 7.1 From a link
- Paste a URL. If the page has structured recipe data, use it; otherwise extract the recipe with AI.
- Recipes in another language are translated into natural Hebrew. The original URL and site name are kept as the source.
- A page that isn't a recipe shows a clear message, not an empty form.

### 7.2 From pasted text
- Paste any text (a WhatsApp message, an email). AI splits it into title, ingredients and steps.

### 7.3 Bulk import (onboarding)
- **Google Doc / PDF:** split by category headings and recipe headings; each recipe body is structured by AI. Category headings map to the book's categories. Lines like "↑ לתוכן העניינים · הוספה לארוחה בוואטסאפ" are removed. A "מקור המתכון" link becomes the source.
- **Google Keep (Takeout ZIP):** one recipe per note. Labels become tags, with a screen to map labels to categories. Image attachments are imported. The original creation date is kept.
- An entry that is only a link is queued for import from that link (§7.1).
- An empty entry is listed as "ריק — למחוק?".
- Import runs in the background with progress ("47/191"). You can leave and come back.
- Before starting, the app shows how many recipes it found (AI costs money per recipe).
- **Batch review:** likely duplicates are grouped (similar title plus overlapping ingredients) with "מיזוג / לשמור את שניהם / דילוג". Known duplicates in Efrat's doc: "מוסקה של קורין" / "מוסקה – קורין", two "פולנטה של מחניודה", two "עוף בלימון".
- Recipes without an image get a placeholder and a "צלמי בבישול הבא" reminder.
- Running the same import again offers "skip all duplicates".

### 7.4 From a photo (Phase 2)
- Photograph a cookbook page or a screenshot; AI reads and structures it.

## 8. Meals and shopping list

### 8.1 Meal tray
- "הוספה לארוחה" anywhere adds the dish to the current draft meal.
- A floating pill **"מגש הארוחה · N"** sits above the bottom tabs and counts dishes.
- The tray is saved on the server, so it's the same on every device.

### 8.2 Meals (screen 4)
- A meal has a title, a date ("ארוחת שישי · 14.11"), and dishes, each with its servings.
- Each dish row has **"החלפה"** (pick another recipe from the library) and **"הסרה"**.
- Removing a dish shows a 5-second "בטל" toast. No confirmation dialog.
- **"הוספת מנה +"** and the primary button **"יצירת רשימת קניות"**.
- **"דף ארוחה":** one scrolling page with all the meal's recipes in full, for cooking several dishes at once.

### 8.3 Units
- **Metric only.** Everything is stored in a base unit: grams (g), millilitres (ml), or a count (יח׳). Display uses g/kg, ml/l, °C.
- Conversions on import:

| From | To |
|---|---|
| 1 כף (tbsp) | 15 ml |
| 1 כפית (tsp) | 5 ml |
| 1 כוס (cup) | 240 ml |
| 1 oz | 28 g |
| 1 lb | 454 g |
| 1 fl oz | 30 ml |
| °F | °C, rounded to the nearest 10 |

- Where a recipe gives a dry ingredient in cups or spoons, it stays in ml (no density guessing).

### 8.4 Shopping list (screen 5)
- **One list per meal**, built from all its dishes.
- **Merging:** the same canonical ingredient in a compatible unit is added up, and the list shows which dishes it's for: "גזר · 5 יח׳ (מרק + סלט)". Example: 2 tbsp oil + 30 ml oil = 60 ml oil.
- **Rounding to buyable amounts:** grams and ml round up to the next 50 (up to 1 kg / 1 l) or the next 100 (above that); counts round up to a whole number. Example: 330 g → 350 g.
- Items without an amount ("מלח ופלפל") are listed once, without an amount.
- **Grouped by store section**, in the book's section order (§6).
- **"כבר יש בבית":** pantry items (below) go into a collapsed group at the bottom, "כבר יש בבית (N)", instead of the main list. Tapping one moves it back to the list.
- **Checking off:** the whole row is the tap target. A checked item is struck through and slides to the bottom of its section.
- **Changes to the meal rebuild the list immediately.** Swapping a dish removes only ingredients no other dish needs, and keeps the checks on everything still on the list.
- Unchecking an item shows a 5-second "בטל" toast.
- Footer: **שיתוף** (plain text through the phone's share sheet), **הדפסה**, **סיימתי**.
- Building the list uses no AI, and is instant (under 50 ms for 6 recipes).

**Pantry list** (per book, editable in settings). **⚠️ TODO (family): confirm what's usually in the house.** Suggested default:
שמן זית, שמן קנולה, מלח, פלפל שחור, קמח, סוכר, פפריקה, כמון, כורכום, אבקת שום, אורגנו, קינמון, חומץ, רוטב סויה.

## 9. Sharing and export

- **Settings → "מי רואה את הספר":** every member with role and invite date.
- **"הזמנה":** enter an email. The invitee gets a Hebrew email and lands in the book after signing in with that email. Opening the invite while signed in with a different email is refused.
- **Revoke** removes access at once.
- Viewers see no edit, add or delete controls.
- **"ייצוא מלא"** (from day one):
  - a JSON file of the whole book (recipes, ingredients, steps, versions, image links valid for 7 days) that can be imported back into an empty book with the same recipe count
  - a printable HTML/PDF book with a clickable table of contents, like the original Doc

## 10. Preferences and excluded ingredients

- Each book has a list of ingredients the family doesn't eat. An exclusion is **global** (anywhere), per **category**, or per **recipe**.
- A recipe that contains an excluded ingredient is **never hidden**. It shows a warning chip on its card, its page, and in menu suggestions, naming the ingredient.
- The menu builder (§13.1) never suggests a recipe with an excluded ingredient.
- Excluded ingredients are hard rules. Taste preferences (less sugar, no cream) are soft: they only affect ranking.

**⚠️ TODO (family): complete the list.** Known so far:

| Ingredient | Scope |
|---|---|
| הל (cardamom) | Global: anywhere |
| פטרוזיליה (parsley) | Only in the sweet-potato soup |

## 11. Non-functional requirements

- **Hebrew and RTL first.** The whole interface is in Hebrew, right to left, correct on every screen.
- **Phone first.** Designed for an iPhone on the kitchen counter: wet hands, glancing from a distance. Every tap target is at least 44 px. Every action works by tapping; nothing needs a swipe.
- **Tablet:** more columns in the library; in cook mode, the ingredients become a fixed side panel.
- **Installable (PWA)** to the home screen. Offline reading comes in Phase 3.
- **Feedback:** every button responds the moment it's touched, not on release.
- **Accessibility:** text scales with the phone's text-size setting; respects "reduce motion" and "reduce transparency".
- **Speed:** library and search results within 1 second on a phone over 4G; shopping list instant.
- **Privacy and security:**
  - Access is enforced in the database, not only in the interface. A bug in a screen must not expose another family's book.
  - Images are private.
  - AI runs on the server; recipe content is sent to the AI provider only to structure, translate or read it.
  - Account and book deletion and a privacy policy are required before other families can sign up.
- **Cost control:** AI import is capped per book before public sign-up.

## 12. Screens

Four bottom tabs, always visible: **ספרייה · ארוחות · קניות · הוספה**. They replace the Doc's "↑ back to contents" links.

### Screen 1: Library (ספרייה)
```
[ חיפוש מתכון…                         ]
( הכול 191 ) ( מרקים 14 ) ( סלטים 22 ) …   ← scrolls sideways
┌──────────┐ ┌──────────┐
│  image   │ │  image   │
│ מרק עדשים│ │ סלט ירוק │
│ מרקים · 45 דק׳│ סלטים · 15 דק׳│
└──────────┘ └──────────┘
            ( מגש הארוחה · 3 )             ← floating pill
[ ספרייה | ארוחות | קניות | הוספה ]
```
Details: §5.1.

### Screen 2: Recipe page
```
[ hero image                              ]
מרק עדשים כתומות
( מרקים ) ( 45 דק׳ ) ( 6 מנות )   ⚠ מכיל הל
מקור: הבלוג של שירן ↗
[ הוספה לארוחה + ]  [ מצב בישול ]
מצרכים
• 2 כוסות עדשים כתומות
• 1 בצל גדול
…
אופן ההכנה
1. …
2. …
```
Details: §5.2.

### Screen 3: Cook mode
```
שלב 2 מתוך 7 · מרק עדשים         [ ✕ ]

  מטגנים את הבצל בשמן
  עד שהוא שקוף,
  כ־5 דקות.                       ← very large text

[ הקודם ]            [ השלב הבא ]
─────────────────────────────────
═══  מצרכים 3/12                  ← sheet handle
הבא: 2 כוסות עדשים
```
Details: §14.

### Screen 4: Meal
```
ארוחת שישי · 14.11
┌ מרק עדשים · 6 מנות     [החלפה] [הסרה] ┐
┌ עוף בלימון · 6 מנות    [החלפה] [הסרה] ┐
┌ סלט ירוק · 6 מנות      [החלפה] [הסרה] ┐
[ הוספת מנה + ]
[ יצירת רשימת קניות ]          [ דף ארוחה ]
```
Details: §8.2.

### Screen 5: Shopping list
```
רשימת קניות · ארוחת שישי
ירקות ופירות
☐ גזר · 5 יח׳ (מרק + סלט)
☐ בצל · 3 יח׳
☑ ~~לימון · 2 יח׳~~                ← checked items sink
מוצרי חלב וביצים
☐ שמנת · 250 מ״ל
…
▸ כבר יש בבית (6)
[ שיתוף ] [ הדפסה ] [ סיימתי ]
```
Details: §8.4.

## 13. More screens and details

### 13.1 Screen 6: Menu builder (Phase 2)
- Start from 1–2 dishes you already chose, a meal type (Friday dinner, weekday, holiday) and constraints (for example "no more than one oven dish").
- The builder suggests dishes to complete the meal from **this book's recipes only**:
  - fill missing dish roles first (a meal with a main and a soup gets a salad and a side)
  - no two heavy mains
  - prefer dishes that share ingredients, and say so: "חוסך 4 פריטים"
  - mix in dishes that can be made ahead
  - never a recipe with an excluded ingredient (§10)
- Every suggestion shows why it fits. Each dish can be locked or swapped.
- Phase 3: warns about oven and burner clashes (two dishes at different oven temperatures at the same time) based on "המטבח שלי" settings.

### 13.2 Contributors and approval inbox (Phase 2)
- The owner marks specific viewers as contributors.
- A contributor adds a recipe (link, text, photo); it waits as "pending" and only they and the owner see it.
- Owner inbox: approve / edit & approve / reject with a note / approve as a version of an existing recipe.

### 13.3 Screen 7: Review before saving
Every new recipe, from any source, passes through this screen.
- All fields are shown and editable: title, category, servings, times, ingredients (display text plus parsed amount, unit and section), steps, source.
- Fields the AI was unsure about are highlighted.
- **Duplicate warning** when the book already has a recipe with a similar title or mostly the same ingredients: "פתיחת הקיים" / "שמירה כחדש".
- If extraction fails, the raw text opens in the paste editor so nothing is lost.
- "שמירה" saves and opens the new recipe.

### 13.4 Versions, scaling and notes (Phase 2)
- **Scaling:** a servings stepper on the recipe page, in cook mode, and on each dish in a meal. Scaled amounts flow into the shopping list.
- **"הגרסה שלי":** a personal version of a recipe (less sugar, a different pan) that keeps the source credit. One version can be the default.
- Favorites; "עבד / לא עבד"; free-text notes; a one-tap "בישלתי" at the end of cook mode.
- Search by ingredient: "what can I make with X".

### 13.5 Menu-builder fields on every recipe
Stored from day one, filled automatically on import (Efrat's doc hides some in free text, for example "תנור על 160 מעלות"), editable on the recipe:

| Field | Values |
|---|---|
| dish role | מנה עיקרית / תוספת / סלט / מרק / קינוח / מאפה / ממרח / שתייה |
| uses oven | yes / no, and oven temperature in °C |
| uses stovetop | yes / no |
| make ahead | yes / no |
| active minutes | number (hands-on time, not total) |
| cuisine | free text, e.g. איטלקי, מרוקאי |

### 13.6 Open questions

Suggested defaults apply unless decided otherwise:

| Question | Suggested default |
|---|---|
| Who may contribute? | Only people the owner explicitly marks as contributors |
| What do contributors see? | The shared book plus their own submissions |
| What happens to rejected contributions? | Kept for the author for 30 days, then deleted |
| Pending items when a contributor is removed? | Kept in the owner's inbox |
| Hard vs. soft constraints | Excluded ingredients are hard; taste preferences are soft (ranking only) |
| Kitchen equipment for clash detection | One "המטבח שלי" settings screen: number of ovens and burners (Phase 3) |
| Auto-approve trusted contributors? | Off by default; a per-person toggle later |
| Will other families pay, and who covers AI import costs? | Decide before public sign-up, not before building |

## 14. Cook mode

The kitchen is the design brief: phone on the counter, dirty hands, reading from a step away.

- **One step at a time**, in very large text. Header: "שלב 2 מתוך 7 · <title>". Large **"הקודם"** and **"השלב הבא"** buttons at the bottom.
- **The screen stays on** for as long as cook mode is open, and comes back on after switching apps. On older iPhones where this isn't supported (before iOS 18.4 for home-screen apps), a small notice explains it.
- **Ingredients panel:** a sheet at the bottom.
  - Its handle shows progress: "מצרכים 3/12".
  - Collapsed, it shows only the next unchecked ingredient.
  - Drag it up or tap the handle to open it. It follows the finger and can be grabbed mid-motion.
  - Tapping anywhere on a row checks it off. Checked rows are struck through and slide down.
  - When everything is checked: "הכול נוסף ✓", with a button to the last step.
- **Tablet:** the ingredients are a fixed side panel, open by default.
- **Continues across devices:** start on the phone, continue on the tablet. Checks and the current step sync within a second.
- **Reopening** a recipe with a session in progress offers "להמשיך" / "להתחיל מחדש".
- Checks survive editing the recipe or changing servings.
- "Reduce motion" turns slides into fades.
- Phase 3: timers inside steps ("5 דקות" becomes a tappable timer).

---

## Appendix A: Recipe categories

Each new book is seeded with these 11 categories, in this order. Owners can rename, reorder, add or remove them for their own book. For Efrat's book they must match the category headings in her Doc exactly, because the importer maps headings to categories.

**⚠️ TODO (family): replace with the 11 category headings from Efrat's Doc, in the same order and spelling.** Placeholder:

1. מרקים
2. סלטים
3. מנות עיקריות – בשר ועוף
4. דגים
5. צמחוני וטבעוני
6. תוספות
7. פסטה ואורז
8. מאפים ולחמים
9. עוגות
10. קינוחים ועוגיות
11. ממרחים ורטבים
