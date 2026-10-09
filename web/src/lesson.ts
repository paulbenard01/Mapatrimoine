// Printable one-hour lesson plan, in the interface language (FR or EN).
import { h } from "./dom";
import { STRINGS } from "./i18n";
import type { Lang } from "./state";
import type { Lesson } from "./types";

export function renderLesson(
  lesson: Lesson,
  lang: Lang,
  titles: Map<string, string>,
  base: string,
  onBack: () => void,
  onLang: () => void,
): HTMLElement {
  const s = STRINGS[lang];
  const t = <T>(v: { fr: T; en: T }) => v[lang];
  const draft = lesson.review_status !== "reviewed" || lesson.lang_review !== "reviewed";
  let clock = 0;
  return h(
    "article",
    { class: "lesson", lang, "aria-labelledby": "lesson-title" },
    h(
      "div",
      { class: "sheet-tools" },
      h("button", { type: "button", "data-key": "lesson-back", onclick: onBack }, `← ${s.sheetBack}`),
      h("button", { type: "button", "data-key": "lesson-lang", lang: s.switchToLang, onclick: onLang }, s.switchTo),
      h("button", { type: "button", "data-key": "lesson-print", onclick: () => window.print() }, s.print),
    ),
    h(
      "header",
      { class: "lesson-head" },
      h("p", { class: "sheet-kicker" }, `${s.lessonKicker} · ${s.levels[lesson.level === "high" ? "high" : lesson.level]} — ${s.appTitle}`),
      h("h1", { id: "lesson-title", tabindex: "-1" }, t(lesson.title)),
      h("p", { class: "lesson-meta" }, `${t(lesson.grade)} · ${s.minutes(lesson.duration_min)}`),
    ),
    draft ? h("p", { class: "sheet-draft" }, s.lessonDraft) : null,
    h("p", { class: "lesson-summary" }, t(lesson.summary)),
    h(
      "div",
      { class: "lesson-grid" },
      h("section", {}, h("h2", {}, s.lessonObjectives), h("ul", {}, t(lesson.objectives).map((o) => h("li", {}, o)))),
      h("section", {}, h("h2", {}, s.lessonMaterials), h("ul", {}, t(lesson.materials).map((m) => h("li", {}, m)))),
    ),
    h("section", {}, h("h2", {}, s.lessonCurriculum), h("p", {}, t(lesson.curriculum))),
    h(
      "section",
      {},
      h("h2", {}, s.lessonElements),
      h(
        "ul",
        { class: "lesson-elements" },
        lesson.elements.map((id) =>
          h(
            "li",
            {},
            h("a", { href: `${base}?id=${id}&lang=${lang}`, lang: "fr" }, titles.get(id) ?? id),
            " · ",
            h("a", { href: `${base}?id=${id}&sheet=1&lang=${lang}` }, s.worksheetShort),
          ),
        ),
      ),
    ),
    h("h2", {}, s.lessonSteps),
    h(
      "ol",
      { class: "lesson-steps" },
      lesson.steps.map((step) => {
        const start = clock;
        clock += step.minutes;
        return h(
          "li",
          { class: "lesson-step" },
          h(
            "div",
            { class: "step-time" },
            h("strong", {}, `${start}–${clock} min`),
            h("span", {}, s.minutes(step.minutes)),
          ),
          h(
            "div",
            { class: "step-body" },
            h("h3", {}, t(step.title)),
            h("p", { class: "step-role" }, h("strong", {}, `${s.lessonTeacher} : `), t(step.teacher)),
            h("p", { class: "step-role" }, h("strong", {}, `${s.lessonStudents} : `), t(step.students)),
            step.prompts
              ? h("ul", { class: "step-prompts", "aria-label": s.lessonPrompts }, t(step.prompts).map((q) => h("li", {}, q)))
              : null,
          ),
        );
      }),
    ),
    h(
      "div",
      { class: "lesson-grid" },
      h("section", {}, h("h2", {}, s.lessonAssessment), h("p", {}, t(lesson.assessment))),
      h("section", {}, h("h2", {}, s.lessonDifferentiation), h("p", {}, t(lesson.differentiation))),
    ),
    h("section", {}, h("h2", {}, s.lessonFurther), h("p", {}, t(lesson.going_further))),
    lesson.answer_key
      ? h("details", { class: "answer-key", open: true }, h("summary", {}, s.lessonAnswers), h("p", {}, t(lesson.answer_key)))
      : null,
    h("footer", { class: "sheet-foot" }, h("p", {}, s.lessonMadeBy)),
  );
}
