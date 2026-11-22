import { app, page, route, action } from "@wasp.sh/spec";
import { KnowledgePage, QuestionnairePage, ReportPage } from "./src/MainPage" with { type: "ref" };
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
