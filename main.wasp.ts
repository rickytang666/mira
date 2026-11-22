import { app, page, route, action } from "@wasp.sh/spec";
import { KnowledgePage } from "./src/study/KnowledgePage" with { type: "ref" };
import { QuestionnairePage } from "./src/study/QuestionnairePage" with { type: "ref" };
import { ReportPage } from "./src/report/ReportPage" with { type: "ref" };
import { importWebsite, importMcp } from "./src/sources" with { type: "ref" };

export default app({
  name: "fieldwork",
  wasp: { version: "^0.26.1" },
  title: "Fieldwork — Listen. Learn. Build.",
  head: ["<link rel='icon' type='image/svg+xml' href='/favicon.svg' />", "<meta name='theme-color' content='#f8f9f6' />"],
  spec: [
    route("RootRoute", "/", page(KnowledgePage)),
    route("KnowledgeRoute", "/knowledge", page(KnowledgePage)),
    route("QuestionnaireRoute", "/questionnaire", page(QuestionnairePage)),
    route("ReportRoute", "/report", page(ReportPage)),
    action(importWebsite),
    action(importMcp),
  ],
});
