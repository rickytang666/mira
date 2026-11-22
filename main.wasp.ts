import { app, page, route, action, query, job, api } from "@wasp.sh/spec";
import { NewStudyPage } from "./src/study/NewStudyPage" with { type: "ref" };
import { KnowledgePage } from "./src/study/KnowledgePage" with { type: "ref" };
import { QuestionnairePage } from "./src/study/QuestionnairePage" with { type: "ref" };
import { ReportPage } from "./src/report/ReportPage" with { type: "ref" };
import { importWebsite, importMcp } from "./src/sources" with { type: "ref" };
import { createStudy, getStudies, getStudy, updateStudy, getPublicStudy, finishInterview, getReport } from "./src/study/operations" with { type: "ref" };
import { processInterview } from "./src/jobs/processInterview" with { type: "ref" };
import { interviewAudio } from "./src/jobs/interviewAudio" with { type: "ref" };

export default app({
  name: "fieldwork",
  wasp: { version: "^0.26.1" },
  title: "Fieldwork — Listen. Learn. Build.",
  head: ["<link rel='icon' type='image/svg+xml' href='/favicon.svg' />", "<meta name='theme-color' content='#f8f9f6' />"],
  spec: [
    route("RootRoute", "/", page(NewStudyPage)),
    route("KnowledgeRoute", "/study/:studyId/knowledge", page(KnowledgePage)),
    route("QuestionnaireRoute", "/study/:studyId/questionnaire", page(QuestionnairePage)),
    route("ReportRoute", "/study/:studyId/report", page(ReportPage)),
    action(importWebsite),
    action(importMcp),
    action(createStudy, { entities: ["Study", "Question"] }),
    query(getStudies, { entities: ["Study"] }),
    query(getStudy, { entities: ["Study", "Question"] }),
    action(updateStudy, { entities: ["Study", "Question"] }),
    query(getPublicStudy, { entities: ["Study", "Question"] }),
    action(finishInterview, { entities: ["Study", "Interview"] }),
    query(getReport, { entities: ["Study", "Interview", "Theme", "Quote"] }),
    job(processInterview, { executor: "PgBoss", entities: ["Interview", "Study", "Question", "Theme", "Quote"], performExecutorOptions: { pgBoss: { retryLimit: 0 } } }),
    api("GET", "/api/interviews/:interviewId/audio", interviewAudio, { entities: ["Interview"] }),
  ],
});
