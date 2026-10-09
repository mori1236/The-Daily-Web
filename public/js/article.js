// סקריפט צד-לקוח לעמוד כתבה בודדת
document.addEventListener('DOMContentLoaded', () => {
    // 1. שמירת הכתבה בהיסטוריית הכתבות שנקראו (localStorage)
    const commentsSection = document.getElementById('commentsSection');
    const articleId = commentsSection ? commentsSection.dataset.articleId : null;

    if (articleId) {
        try {
            const readKey = 'dailyweb_read_articles';
            const readList = JSON.parse(localStorage.getItem(readKey) || '[]');
            if (!readList.includes(articleId)) {
                readList.push(articleId);
                localStorage.setItem(readKey, JSON.stringify(readList));
            }
        } catch (e) {
            console.warn('Could not store read article', e);
        }
    }

    if (!commentsSection || !articleId) return;

    // 2. ניהול מזהה מכשיר עבור הגבלת קצב תגובות לאורחים
    let deviceId = localStorage.getItem('dailyweb_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        localStorage.setItem('dailyweb_device_id', deviceId);
    }

    // 3. אלמנטים בממשק התגובות
    const commentForm = document.getElementById('commentForm');
    const contentTextarea = document.getElementById('commentContent');
    const authorNameInput = document.getElementById('commentAuthorName');
    const submitBtn = document.getElementById('submitCommentBtn');
    const errorAlert = document.getElementById('commentFormError');
    const commentsList = document.getElementById('commentsList');
    const commentsCountEl = document.getElementById('commentsCount');
    const bylineCountEl = document.getElementById('bylineCommentsCount');
    const openFormBtn = document.getElementById('openCommentFormBtn');
    const noCommentsMsg = document.getElementById('noCommentsMsg');

    // גלילה ומיקוד בטופס בלחיצה על כפתור "כתיבת תגובה"
    if (openFormBtn) {
        openFormBtn.addEventListener('click', () => {
            commentForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (authorNameInput && !authorNameInput.value.trim()) {
                authorNameInput.focus();
            } else if (contentTextarea) {
                contentTextarea.focus();
            }
        });
    }

    // הצגת שגיאה בטופס
    function showError(message) {
        if (!errorAlert) return;
        errorAlert.textContent = message;
        errorAlert.style.display = 'block';
    }

    // הסתרת שגיאה
    function clearError() {
        if (!errorAlert) return;
        errorAlert.textContent = '';
        errorAlert.style.display = 'none';
    }

    // עדכון מונה התגובות
    function incrementCount() {
        if (commentsCountEl) {
            const current = parseInt(commentsCountEl.textContent, 10) || 0;
            commentsCountEl.textContent = current + 1;
        }
        if (bylineCountEl) {
            const current = parseInt(bylineCountEl.textContent, 10) || 0;
            bylineCountEl.textContent = current + 1;
        }
    }

    // בניית אלמנט HTML עבור תגובה חדשה
    function buildCommentElement(comment) {
        const article = document.createElement('article');
        article.className = 'comment-item';
        article.id = 'comment-' + comment.id;
        article.dataset.commentId = comment.id;

        const avatar = document.createElement('div');
        avatar.className = 'comment-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        const initials = document.createElement('span');
        initials.className = 'avatar-initials';
        initials.textContent = comment.initials || '??';
        avatar.appendChild(initials);

        const body = document.createElement('div');
        body.className = 'comment-body';

        const meta = document.createElement('header');
        meta.className = 'comment-meta';
        const author = document.createElement('span');
        author.className = 'comment-author';
        author.textContent = comment.authorName;
        const time = document.createElement('time');
        time.className = 'comment-time';
        time.textContent = comment.relativeTime || 'הרגע';
        if (comment.createdAtIso) {
            time.setAttribute('datetime', comment.createdAtIso);
        }
        meta.appendChild(author);
        meta.appendChild(time);

        const text = document.createElement('p');
        text.className = 'comment-text';
        text.textContent = comment.content;

        const actions = document.createElement('footer');
        actions.className = 'comment-actions';

        const replyBtn = document.createElement('button');
        replyBtn.type = 'button';
        replyBtn.className = 'btn-comment-action btn-reply';
        replyBtn.textContent = 'השב';
        replyBtn.dataset.author = comment.authorName;
        attachReplyHandler(replyBtn);

        const reportBtn = document.createElement('button');
        reportBtn.type = 'button';
        reportBtn.className = 'btn-comment-action btn-report';
        reportBtn.textContent = 'דיווח';
        attachReportHandler(reportBtn);

        actions.appendChild(replyBtn);
        actions.appendChild(reportBtn);

        body.appendChild(meta);
        body.appendChild(text);
        body.appendChild(actions);

        article.appendChild(avatar);
        article.appendChild(body);

        return article;
    }

    // טיפול בלחיצה על כפתור "השב"
    function attachReplyHandler(btn) {
        btn.addEventListener('click', () => {
            const author = btn.dataset.author;
            if (contentTextarea) {
                const prefix = author ? `@${author} ` : '';
                if (!contentTextarea.value.startsWith(prefix)) {
                    contentTextarea.value = prefix + contentTextarea.value;
                }
                commentForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
                contentTextarea.focus();
            }
        });
    }

    // טיפול בלחיצה על כפתור "דיווח"
    function attachReportHandler(btn) {
        btn.addEventListener('click', () => {
            btn.textContent = 'דווח ✓';
            btn.style.color = 'var(--color-success)';
            btn.disabled = true;
        });
    }

    // חיבור מאזינים לכל כפתורי השב/דיווח הקיימים בדף
    document.querySelectorAll('.btn-reply').forEach(attachReplyHandler);
    document.querySelectorAll('.btn-report').forEach(attachReportHandler);

    // 4. שליחת הטופס ב-Ajax
    if (commentForm) {
        commentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearError();

            const content = contentTextarea ? contentTextarea.value.trim() : '';
            if (!content) {
                showError('אנא כתבו תוכן לתגובה.');
                if (contentTextarea) contentTextarea.focus();
                return;
            }

            const authorName = authorNameInput ? authorNameInput.value.trim() : '';
            if (authorNameInput && !authorName) {
                showError('אנא הזינו את שמכם.');
                authorNameInput.focus();
                return;
            }

            // השבתת כפתור השליחה בזמן פעולה
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span>שולח...</span>';
            }

            try {
                const response = await fetch(`/api/articles/${articleId}/comments`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-device-id': deviceId,
                    },
                    body: JSON.stringify({
                        authorName: authorName,
                        content: content,
                    }),
                });

                const data = await response.json();

                if (!response.ok) {
                    showError(data.error || 'אירעה שגיאה בשליחת התגובה. אנא נסו שוב.');
                    return;
                }

                // הצלחה: ניקוי שדה התוכן
                if (contentTextarea) {
                    contentTextarea.value = '';
                }

                // הסרת הודעת "אין עדיין תגובות"
                if (noCommentsMsg) {
                    noCommentsMsg.remove();
                }

                // הוספת התגובה החדשה מיד בראש הרשימה
                const newCommentEl = buildCommentElement(data.comment);
                if (commentsList) {
                    commentsList.insertBefore(newCommentEl, commentsList.firstChild);
                }

                // עדכון חותמת הזמן האחרונה כדי למנוע כפילויות בפולינג
                if (data.comment.createdAtIso) {
                    latestCommentTimestamp = data.comment.createdAtIso;
                }

                // עדכון המונה
                incrementCount();

            } catch (err) {
                console.error('Comment submit error:', err);
                showError('חיבור השרת נכשל. אנא בדקו את החיבור לרשת ונסו שוב.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<span>פרסום תגובה</span>';
                }
            }
        });
    }

    // 5. Lightweight Polling: בדיקה תקופתית קלת-משקל של תגובות חדשות
    const firstTimeEl = commentsList ? commentsList.querySelector('.comment-item time[datetime]') : null;
    let latestCommentTimestamp = firstTimeEl ? firstTimeEl.getAttribute('datetime') : new Date().toISOString();

    const POLLING_INTERVAL_MS = 12000; // כל 12 שניות

    async function pollNewComments() {
        // אם הלשונית ברקע / ממוזערת, לא מבזבזים משאבים
        if (document.visibilityState !== 'visible') return;

        try {
            const url = `/api/articles/${articleId}/comments?since=${encodeURIComponent(latestCommentTimestamp)}`;
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json' },
            });

            if (!response.ok) return;

            const data = await response.json();
            const newComments = data.comments || [];

            if (newComments.length > 0) {
                // הוספת תגובות חדשות שלא קיימות עדיין ב-DOM
                // מגיעות מהחדשה לישנה, נהפוך כדי להכניס בראש הרשימה בסדר הנכון
                const toInsert = [...newComments].reverse();

                for (const c of toInsert) {
                    if (!document.getElementById('comment-' + c.id)) {
                        const el = buildCommentElement(c);
                        if (commentsList) {
                            commentsList.insertBefore(el, commentsList.firstChild);
                        }
                    }
                }

                // עדכון חותמת הזמן האחרונה לתגובה החדשה ביותר
                if (newComments[0].createdAtIso) {
                    latestCommentTimestamp = newComments[0].createdAtIso;
                }

                // הסרת הודעת "אין עדיין תגובות"
                if (noCommentsMsg) {
                    noCommentsMsg.remove();
                }

                // סנכרון המונה הכולל
                if (typeof data.count === 'number') {
                    if (commentsCountEl) commentsCountEl.textContent = data.count;
                    if (bylineCountEl) bylineCountEl.textContent = data.count;
                }
            }
        } catch (err) {
            // שגיאות רשת שקטות בפולינג כדי לא להפריע למשתמש
            console.debug('Polling error (handled silently):', err);
        }
    }

    // הפעלת הפולינג במרווח קבוע
    const pollTimer = setInterval(pollNewComments, POLLING_INTERVAL_MS);

    // ניקוי הטיימר בעת עזיבת העמוד
    window.addEventListener('beforeunload', () => {
        clearInterval(pollTimer);
    });
});
