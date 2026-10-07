// Client script for the writer page (views/writer.ejs).

const searchInput = document.getElementById('writer-search-input');

// When the search box is emptied (backspace, select-all + delete, or the "x" button),
// reload the list without the text query. The status filter stays.
searchInput.addEventListener('input', () => {
    if (searchInput.value.trim() !== '') return;

    const params = new URLSearchParams(location.search);
    if (!params.has('q')) return; // nothing to clear

    params.delete('q');
    params.delete('page'); // the old page number may not exist without the query
    const queryString = params.toString();
    location.href = queryString ? `/writer?${queryString}` : '/writer';
});
