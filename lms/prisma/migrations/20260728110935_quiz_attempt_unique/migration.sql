/*
  Warnings:

  - A unique constraint covering the columns `[quizId,userId]` on the table `QuizAttempt` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "QuizAttempt_quizId_userId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "QuizAttempt_quizId_userId_key" ON "QuizAttempt"("quizId", "userId");
