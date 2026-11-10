import { isRequestSubject } from './emailRequestIntake'

// מייל בקשה נקלט מתיבת האיגוד ולא מועבר ל-Gmail האישי.
export function shouldForwardToGmail(requestSubject: string): boolean {
  return !isRequestSubject(requestSubject)
}
