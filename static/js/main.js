document.addEventListener("DOMContentLoaded", () => {
    // --- State Variables ---
    let releasesData = [];
    let feedTitle = "BigQuery - Release notes";
    let lastUpdatedTime = null;
    let searchQuery = "";
    const selectedCategories = new Set(["Feature", "Change", "Issue", "Breaking", "Announcement"]);
    let dateLimitDays = "all";
    let activeTheme = "dark";

    // --- DOM Elements ---
    const searchInput = document.getElementById("search-input");
    const clearSearchBtn = document.getElementById("clear-search");
    const categoryFiltersContainer = document.getElementById("category-filters-container");
    const timelineEvents = document.getElementById("timeline-events");
    const timelineContainer = document.getElementById("timeline-container");
    
    // Status Overlays
    const loadingOverlay = document.getElementById("loading-overlay");
    const errorOverlay = document.getElementById("error-overlay");
    const errorMessage = document.getElementById("error-message");
    const emptyState = document.getElementById("empty-state");
    
    // Control Buttons
    const refreshBtn = document.getElementById("refresh-btn");
    const spinnerIcon = document.getElementById("spinner-icon");
    const retryBtn = document.getElementById("retry-btn");
    const resetFiltersBtn = document.getElementById("reset-filters-btn");
    const themeToggleBtn = document.getElementById("theme-toggle");
    const themeText = document.getElementById("theme-text");
    const mainTitle = document.getElementById("main-title");
    const syncStatus = document.getElementById("sync-status");
    
    // Stats elements
    const statFeature = document.getElementById("stat-count-feature");
    const statChange = document.getElementById("stat-count-change");
    const statIssue = document.getElementById("stat-count-issue");
    const statBreaking = document.getElementById("stat-count-breaking");

    // --- Core Methods ---

    // Initialize application
    function init() {
        setupEventListeners();
        loadThemePreference();
        fetchReleases(false);
    }

    // Load theme from localStorage or system preference
    function loadThemePreference() {
        const storedTheme = localStorage.getItem("theme");
        if (storedTheme) {
            activeTheme = storedTheme;
        } else {
            // Default to dark
            activeTheme = "dark";
        }
        applyTheme(activeTheme);
    }

    // Apply active theme
    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
        activeTheme = theme;
        
        if (theme === "light") {
            themeText.textContent = "Dark Mode";
        } else {
            themeText.textContent = "Light Mode";
        }
    }

    // Toggle theme
    function toggleTheme() {
        const nextTheme = activeTheme === "dark" ? "light" : "dark";
        applyTheme(nextTheme);
    }

    // Set up all event handlers
    function setupEventListeners() {
        // Theme Toggle
        themeToggleBtn.addEventListener("click", toggleTheme);

        // Search Input (with simple debounce)
        let searchTimeout;
        searchInput.addEventListener("input", (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchQuery = e.target.value.trim();
                render();
            }, 250);
        });

        // Clear Search Button
        clearSearchBtn.addEventListener("click", () => {
            searchInput.value = "";
            searchQuery = "";
            searchInput.focus();
            render();
        });

        // Refresh Button
        refreshBtn.addEventListener("click", () => {
            fetchReleases(true);
        });

        // Retry Connection Button
        retryBtn.addEventListener("click", () => {
            fetchReleases(true);
        });

        // Reset Filters Button
        resetFiltersBtn.addEventListener("click", resetFilters);

        // Category Filter checkboxes
        const filterLabels = categoryFiltersContainer.querySelectorAll(".filter-item");
        filterLabels.forEach(label => {
            const checkbox = label.querySelector("input");
            const category = label.dataset.category;

            label.addEventListener("click", (e) => {
                // Prevent duplicate click triggers if clicked directly on input
                if (e.target.tagName === "INPUT") return;
                
                e.preventDefault();
                toggleCategoryFilter(category, label, checkbox);
            });
        });

        // Quick Date Buttons
        const dateBtns = document.querySelectorAll(".date-btn");
        dateBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                dateBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                dateLimitDays = btn.dataset.days;
                render();
            });
        });

        // Event delegation for tweet buttons
        timelineEvents.addEventListener("click", (e) => {
            const tweetBtn = e.target.closest(".tweet-btn");
            if (tweetBtn) {
                e.preventDefault();
                const date = tweetBtn.dataset.date;
                const category = tweetBtn.dataset.category;
                const link = tweetBtn.dataset.link;
                const eventCard = tweetBtn.closest(".event-card");
                const contentDiv = eventCard.querySelector(".card-content");
                const plainText = contentDiv.innerText || contentDiv.textContent || "";
                shareOnTwitter(date, category, plainText, link);
            }
        });
    }

    // Toggle category selection
    function toggleCategoryFilter(category, labelElement, checkbox) {
        if (category === "all") {
            const isCheckingAll = !labelElement.classList.contains("checked");
            const filterLabels = categoryFiltersContainer.querySelectorAll(".filter-item");
            
            filterLabels.forEach(label => {
                const cb = label.querySelector("input");
                const cat = label.dataset.category;
                
                if (isCheckingAll) {
                    label.classList.add("checked");
                    cb.checked = true;
                    if (cat !== "all") selectedCategories.add(cat);
                } else {
                    label.classList.remove("checked");
                    cb.checked = false;
                    if (cat !== "all") selectedCategories.delete(cat);
                }
            });
        } else {
            const isChecked = !labelElement.classList.contains("checked");
            
            if (isChecked) {
                labelElement.classList.add("checked");
                checkbox.checked = true;
                selectedCategories.add(category);
            } else {
                labelElement.classList.remove("checked");
                checkbox.checked = false;
                selectedCategories.delete(category);
            }

            // Update "All Categories" state
            const allLabel = document.getElementById("filter-all");
            const allCheckbox = allLabel.querySelector("input");
            const nonAllFilters = Array.from(categoryFiltersContainer.querySelectorAll(".filter-item")).filter(l => l.dataset.category !== "all");
            const allChecked = nonAllFilters.every(l => l.classList.contains("checked"));
            
            if (allChecked) {
                allLabel.classList.add("checked");
                allCheckbox.checked = true;
            } else {
                allLabel.classList.remove("checked");
                allCheckbox.checked = false;
            }
        }
        render();
    }

    // Reset filters to defaults
    function resetFilters() {
        searchInput.value = "";
        searchQuery = "";
        
        // Reset categories (select all)
        const filterLabels = categoryFiltersContainer.querySelectorAll(".filter-item");
        filterLabels.forEach(label => {
            label.classList.add("checked");
            const cb = label.querySelector("input");
            cb.checked = true;
            const cat = label.dataset.category;
            if (cat !== "all") selectedCategories.add(cat);
        });

        // Reset date
        const dateBtns = document.querySelectorAll(".date-btn");
        dateBtns.forEach(btn => btn.classList.remove("active"));
        document.getElementById("date-all").classList.add("active");
        dateLimitDays = "all";

        render();
    }

    // AJAX Call to fetch releases
    function fetchReleases(forceRefresh = false) {
        showLoading(true);
        refreshBtn.classList.add("refreshing");
        
        let url = "/api/releases";
        if (forceRefresh) {
            url += "?refresh=true";
        }

        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    releasesData = data.releases || [];
                    feedTitle = data.feed_title || "BigQuery - Release notes";
                    lastUpdatedTime = data.last_updated;
                    
                    // Update header title & sync status
                    mainTitle.textContent = feedTitle;
                    updateSyncTimeDisplay();
                    
                    showLoading(false);
                    showError(false, "");
                    render();
                } else {
                    throw new Error(data.error || "Failed to fetch parsed releases.");
                }
            })
            .catch(err => {
                console.error("Fetch Error:", err);
                showLoading(false);
                showError(true, err.message);
            })
            .finally(() => {
                refreshBtn.classList.remove("refreshing");
            });
    }

    function updateSyncTimeDisplay() {
        if (!lastUpdatedTime) {
            syncStatus.textContent = "Last checked: Unknown";
            return;
        }
        
        const dateObj = new Date(lastUpdatedTime);
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        const seconds = String(dateObj.getSeconds()).padStart(2, '0');
        syncStatus.textContent = `Last updated: ${hours}:${minutes}:${seconds}`;
    }

    // Helper functions for overlays
    function showLoading(isLoading) {
        if (isLoading) {
            loadingOverlay.classList.remove("hidden");
            timelineContainer.classList.add("hidden");
            emptyState.classList.add("hidden");
        } else {
            loadingOverlay.classList.add("hidden");
            timelineContainer.classList.remove("hidden");
        }
    }

    function showError(isError, message) {
        if (isError) {
            errorMessage.textContent = message;
            errorOverlay.classList.remove("hidden");
            timelineContainer.classList.add("hidden");
            emptyState.classList.add("hidden");
        } else {
            errorOverlay.classList.add("hidden");
        }
    }

    // HTML highlights for search keyword
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function highlightHTML(htmlContent, query) {
        if (!query) return htmlContent;
        
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = htmlContent;
        
        const regex = new RegExp(`(${escapeRegExp(query)})`, "gi");
        
        function traverse(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.nodeValue;
                if (regex.test(text)) {
                    const span = document.createElement("span");
                    // We must escape html chars within the matched text before replacing
                    // but since we are inserting span tags, we will write it into innerHTML
                    span.innerHTML = text.replace(regex, '<span class="highlight">$1</span>');
                    node.parentNode.replaceChild(span, node);
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName !== "SCRIPT" && node.tagName !== "STYLE" && node.tagName !== "A") {
                    const children = Array.from(node.childNodes);
                    for (let child of children) {
                        traverse(child);
                    }
                } else if (node.tagName === "A") {
                    // Highlight anchor text but don't mess up href
                    const children = Array.from(node.childNodes);
                    for (let child of children) {
                        traverse(child);
                    }
                }
            }
        }
        
        traverse(tempDiv);
        return tempDiv.innerHTML;
    }

    // Helper icon getter
    function getCategoryIcon(category) {
        switch(category) {
            case "Feature": return "fa-wand-magic-sparkles";
            case "Change": return "fa-sliders";
            case "Issue": return "fa-triangle-exclamation";
            case "Breaking": return "fa-bolt";
            case "Announcement": return "fa-bullhorn";
            default: return "fa-circle-info";
        }
    }

    // Render timeline and compute stats
    function render() {
        if (!releasesData || releasesData.length === 0) {
            timelineEvents.innerHTML = "";
            emptyState.classList.remove("hidden");
            return;
        }

        // 1. Establish reference "Today" date
        // Some release notes might be in the future relative to the host machine clock,
        // so we use the maximum date in the dataset as 'today' if it's newer than the clock.
        let referenceDate = new Date();
        releasesData.forEach(release => {
            const relDate = new Date(release.updated || release.date);
            if (relDate > referenceDate) {
                referenceDate = relDate;
            }
        });

        // 2. Filter data
        const filteredReleases = [];
        const globalCounts = {
            all: 0,
            Feature: 0,
            Change: 0,
            Issue: 0,
            Breaking: 0,
            Announcement: 0
        };

        releasesData.forEach(release => {
            const releaseDate = new Date(release.updated || release.date);
            
            // Check date limit
            if (dateLimitDays !== "all") {
                const diffTime = referenceDate - releaseDate;
                const diffDays = diffTime / (1000 * 60 * 60 * 24);
                if (diffDays > parseInt(dateLimitDays)) {
                    return; // Skip if older than limit
                }
            }

            const matchingItems = [];

            release.items.forEach(item => {
                // Keep track of counts for sidebar stats
                const category = item.category || "Announcement";
                if (category in globalCounts) {
                    globalCounts[category]++;
                    globalCounts.all++;
                } else {
                    globalCounts["Announcement"]++;
                    globalCounts.all++;
                }

                // Filter by category
                if (!selectedCategories.has(category)) {
                    return;
                }

                // Filter by search query
                if (searchQuery) {
                    const searchLower = searchQuery.toLowerCase();
                    const inDate = release.date.toLowerCase().includes(searchLower);
                    const inCategory = category.toLowerCase().includes(searchLower);
                    const inDesc = item.description.toLowerCase().includes(searchLower);
                    
                    if (!inDate && !inCategory && !inDesc) {
                        return; // Skip if query doesn't match date, category, or description
                    }
                }

                matchingItems.push(item);
            });

            if (matchingItems.length > 0) {
                filteredReleases.push({
                    ...release,
                    items: matchingItems
                });
            }
        });

        // 3. Update count badges in sidebar
        document.getElementById("count-all").textContent = globalCounts.all;
        document.getElementById("count-feature").textContent = globalCounts.Feature;
        document.getElementById("count-change").textContent = globalCounts.Change;
        document.getElementById("count-issue").textContent = globalCounts.Issue;
        document.getElementById("count-breaking").textContent = globalCounts.Breaking;
        document.getElementById("count-announcement").textContent = globalCounts.Announcement;

        // 4. Update stats cards in main panel (active count)
        statFeature.textContent = globalCounts.Feature;
        statChange.textContent = globalCounts.Change;
        statIssue.textContent = globalCounts.Issue;
        statBreaking.textContent = globalCounts.Breaking;

        // 5. Handle empty states
        if (filteredReleases.length === 0) {
            timelineEvents.innerHTML = "";
            timelineContainer.classList.add("hidden");
            emptyState.classList.remove("hidden");
            return;
        }

        emptyState.classList.add("hidden");
        timelineContainer.classList.remove("hidden");

        // 6. Build timeline HTML
        let timelineHTML = "";
        
        filteredReleases.forEach(release => {
            const relDate = new Date(release.updated || release.date);
            const diffTime = Math.abs(referenceDate - relDate);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            
            let timeLabel = "";
            if (diffDays === 0) timeLabel = "Latest";
            else if (diffDays === 1) timeLabel = "Yesterday";
            else timeLabel = `${diffDays} days ago`;

            timelineHTML += `
                <div class="timeline-day">
                    <div class="day-marker"></div>
                    <div class="day-header">
                        <div class="day-title">
                            <span class="date-text">${highlightHTML(release.date, searchQuery)}</span>
                            <span class="day-relative-time">${timeLabel}</span>
                        </div>
                    </div>
                    <div class="day-events">
            `;

            release.items.forEach(item => {
                const cat = item.category || "Announcement";
                const icon = getCategoryIcon(cat);
                const descHighlighted = highlightHTML(item.description, searchQuery);
                const categoryHighlighted = highlightHTML(cat, searchQuery);

                timelineHTML += `
                    <article class="event-card" data-category="${cat}">
                        <div class="card-header">
                            <span class="badge badge-${cat.toLowerCase()}">
                                <i class="fa-solid ${icon}"></i>
                                ${categoryHighlighted}
                            </span>
                            <div class="card-actions">
                                <button class="card-action-btn tweet-btn" title="Tweet about this update" data-date="${release.date}" data-category="${cat}" data-link="${release.link}">
                                    <i class="fa-brands fa-x-twitter"></i>
                                </button>
                                <a href="${release.link}" target="_blank" rel="noopener" class="card-link" title="Open official release notes page">
                                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                                </a>
                            </div>
                        </div>
                        <div class="card-content">
                            ${descHighlighted}
                        </div>
                    </article>
                `;
            });

            timelineHTML += `
                    </div>
                </div>
            `;
        });

        timelineEvents.innerHTML = timelineHTML;
    }

    function shareOnTwitter(date, category, text, link) {
        let cleanText = text.replace(/\s+/g, " ").trim();
        const maxLength = 160;
        if (cleanText.length > maxLength) {
            cleanText = cleanText.substring(0, maxLength) + "...";
        }
        const tweetText = `🚀 BigQuery Update (${date}) - ${category}:\n"${cleanText}"\n\n#GoogleCloud #BigQuery`;
        const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(link)}`;
        window.open(tweetUrl, "_blank", "width=550,height=420");
    }

    // Start App
    init();
});
