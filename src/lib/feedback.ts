// "Enviar feedback" no menu: abre o programa de e-mail da pessoa para o e-mail do app. O corpo só
// leva a versão e se é web ou desktop, para saber de onde veio; nada de dado pessoal.
const FEEDBACK_EMAIL = "todoapp70@gmail.com";

export function feedbackMailto(version: string, platform: "web" | "desktop"): string {
  const subject = encodeURIComponent("Tododay — feedback");
  const body = encodeURIComponent(`\n\n---\nTododay ${version} (${platform})`);
  return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
}
