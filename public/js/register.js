// בדיקה בצד הלקוח שאימות הסיסמה תואם לסיסמה (השרת בודק זאת שוב)
const password = document.getElementById('password');
const confirmPassword = document.getElementById('confirmPassword');

function checkPasswordsMatch() {
    if (confirmPassword.value && confirmPassword.value !== password.value) {
        confirmPassword.setCustomValidity('הסיסמאות אינן תואמות');
    } else {
        confirmPassword.setCustomValidity('');
    }
}

password.addEventListener('input', checkPasswordsMatch);
confirmPassword.addEventListener('input', checkPasswordsMatch);
