/**
 * All Hebrew UI strings live here. Components import from this file;
 * never hard-code user-facing text in JSX.
 */
export const he = {
  app: {
    name: "ספר המתכונים",
    shortName: "מתכונים",
    description: "ספר המתכונים המשפחתי",
  },
  nav: {
    label: "ניווט ראשי",
    library: "ספרייה",
    meals: "ארוחות",
    shopping: "קניות",
    add: "הוספה",
  },
  auth: {
    title: "כניסה לספר המתכונים",
    intro: "נשלח אליך מייל עם קוד כניסה. אין צורך בסיסמה.",
    emailLabel: "כתובת מייל",
    sendCode: "שליחת קוד",
    sending: "שולחים…",
    sentTo: (email: string) => `שלחנו קוד אל ${email}`,
    codeLabel: "הקוד מהמייל (6 ספרות)",
    verify: "כניסה",
    verifying: "נכנסים…",
    orLink: "אפשר גם ללחוץ על הקישור שבמייל.",
    changeEmail: "שינוי כתובת המייל",
    signOut: "יציאה",
    errors: {
      invalidEmail: "כתובת המייל לא נראית תקינה",
      sendFailed: "לא הצלחנו לשלוח את המייל. כדאי לנסות שוב בעוד דקה.",
      badCode: "הקוד שגוי או שפג תוקפו",
      linkFailed: "הקישור לא תקין או שפג תוקפו. אפשר לבקש קוד חדש.",
    },
  },
} as const;
