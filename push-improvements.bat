@echo off
cd /d "C:\Users\matth\Documents\Claude CoWork\Retirement Calc"
git status > git-push-log.txt 2>&1
git diff IMPROVEMENTS.md >> git-push-log.txt 2>&1
git add -A >> git-push-log.txt 2>&1
git status >> git-push-log.txt 2>&1
git commit -m "Update improvement backlog with final priority ranking" >> git-push-log.txt 2>&1
git push origin main >> git-push-log.txt 2>&1
echo Done. >> git-push-log.txt 2>&1
