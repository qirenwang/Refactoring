/**
 * Multi-page Form Handler
 * 处理多页表单的导航和数据存储
 */

class MultiFormHandler {
    constructor(formId, totalPages) {
        this.formId = formId;
        this.currentPage = 1;
        this.totalPages = totalPages;
        this.formData = {};

        // 加载初始表单数据（如果存在）
        this.loadFormDataFromSession();

        // 初始化页面
        this.initPages();
        this.updateProgressIndicator();

        // 添加事件监听器
        this.addEventListeners();
    }

    initPages() {
        // 隐藏除了第一页以外的所有页面
        for (let i = 2; i <= this.totalPages; i++) {
            document.getElementById(`form-page${i}`).classList.add('hidden');
        }
    }

    addEventListeners() {
        // 添加继续按钮事件监听器
        const continueButtons = document.querySelectorAll('.btn-continue');
        continueButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const pageNum = parseInt(button.dataset.page);
                this.saveCurrentPageData(pageNum);
                this.navigateToPage(pageNum + 1);
            });
        });

        // 添加上一页按钮事件监听器
        const previousButtons = document.querySelectorAll('.btn-previous');
        previousButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const pageNum = parseInt(button.dataset.page);
                this.saveCurrentPageData(pageNum);
                this.navigateToPage(pageNum - 1);
            });
        });

        // 添加保存按钮事件监听器
        const saveButton = document.querySelector('.btn-save');
        if (saveButton) {
            saveButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.saveCurrentPageData(this.totalPages);
                this.submitForm();
            });
        }

        // 添加表单输入字段的变更事件监听器
        const formInputs = document.querySelectorAll(`#${this.formId} input, #${this.formId} select, #${this.formId} textarea`);
        formInputs.forEach(input => {
            input.addEventListener('change', () => {
                this.saveCurrentPageData(this.currentPage);
            });
        });
    }

    navigateToPage(pageNum) {
        if (pageNum < 1 || pageNum > this.totalPages) return;

        // 验证当前页面数据是否有效
        if (pageNum > this.currentPage && !this.validateCurrentPage()) {
            alert('请填写所有必填字段后再继续。');
            return;
        }

        // 隐藏当前页面
        document.getElementById(`form-page${this.currentPage}`).classList.add('hidden');

        // 显示新页面
        const newPage = document.getElementById(`form-page${pageNum}`);
        newPage.classList.remove('hidden');
        newPage.classList.add('fade-in');

        // 更新当前页面
        this.currentPage = pageNum;

        // 更新进度指示器
        this.updateProgressIndicator();

        // 自动填充表单数据
        this.populateFormFields();

        // 滚动到页面顶部
        window.scrollTo(0, 0);
    }

    validateCurrentPage() {
        const currentPageElement = document.getElementById(`form-page${this.currentPage}`);
        const requiredInputs = currentPageElement.querySelectorAll('input[required], select[required], textarea[required]');

        let isValid = true;
        requiredInputs.forEach(input => {
            if (!input.value.trim()) {
                isValid = false;
                input.classList.add('is-invalid');
            } else {
                input.classList.remove('is-invalid');
            }
        });

        return isValid;
    }

    saveCurrentPageData(pageNum) {
        const currentPageElement = document.getElementById(`form-page${pageNum}`);
        const inputs = currentPageElement.querySelectorAll('input, select, textarea');

        // 保存当前页面的数据
        inputs.forEach(input => {
            if (input.type === 'checkbox') {
                this.formData[input.name] = input.checked;
            } else if (input.type === 'radio') {
                if (input.checked) {
                    this.formData[input.name] = input.value;
                }
            } else {
                this.formData[input.name] = input.value;
            }
        });

        // 保存到会话存储
        this.saveFormDataToSession();
    }

    populateFormFields() {
        // 根据存储的数据填充表单字段
        for (const [name, value] of Object.entries(this.formData)) {
            const inputs = document.querySelectorAll(`[name="${name}"]`);
            inputs.forEach(input => {
                if (input.type === 'checkbox') {
                    input.checked = value;
                } else if (input.type === 'radio') {
                    input.checked = (input.value === value);
                } else {
                    input.value = value;
                }
            });
        }
    }

    updateProgressIndicator() {
        // 更新进度指示器
        const steps = document.querySelectorAll('.progress-step');
        steps.forEach((step, index) => {
            const stepNum = index + 1;

            if (stepNum < this.currentPage) {
                step.classList.add('completed');
                step.classList.remove('active');
            } else if (stepNum === this.currentPage) {
                step.classList.add('active');
                step.classList.remove('completed');
            } else {
                step.classList.remove('active', 'completed');
            }
        });
    }

    saveFormDataToSession() {
        // 保存表单数据到会话存储
        sessionStorage.setItem(`${this.formId}_data`, JSON.stringify(this.formData));
    }

    loadFormDataFromSession() {
        // 从会话存储加载表单数据
        const savedData = sessionStorage.getItem(`${this.formId}_data`);
        if (savedData) {
            this.formData = JSON.parse(savedData);
        }
    }

    submitForm() {
        // 显示加载指示器
        const saveButton = document.querySelector('.btn-save');
        saveButton.disabled = true;

        const loadingIndicator = document.createElement('span');
        loadingIndicator.className = 'loading';
        saveButton.appendChild(loadingIndicator);

        // 创建表单提交数据
        const formSubmitData = new FormData();
        for (const [key, value] of Object.entries(this.formData)) {
            formSubmitData.append(key, value);
        }

        // 使用fetch API提交数据
        fetch('php/save_form_data.php', {
                method: 'POST',
                body: formSubmitData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // 清除会话数据
                    sessionStorage.removeItem(`${this.formId}_data`);

                    // 显示成功消息
                    alert('数据已成功保存！');

                    // 重定向到确认页面或首页
                    window.location.href = 'review.php';
                } else {
                    alert('保存数据时出错：' + data.message);
                    saveButton.disabled = false;
                    saveButton.removeChild(loadingIndicator);
                }
            })
            .catch(error => {
                console.error('提交表单时出错:', error);
                alert('提交表单时出错，请稍后再试。');
                saveButton.disabled = false;
                saveButton.removeChild(loadingIndicator);
            });
    }

    // 手动填充摘要页面
    populateSummary() {
        const summaryContainer = document.getElementById('form-summary');
        if (!summaryContainer) return;

        // 清空现有内容
        summaryContainer.innerHTML = '';

        // 创建摘要内容
        for (const [key, value] of Object.entries(this.formData)) {
            // 忽略空值
            if (!value) continue;

            // 找到字段标签
            let label = key;
            const labelElement = document.querySelector(`label[for="${key}"]`);
            if (labelElement) {
                label = labelElement.textContent;
            }

            // 创建摘要项
            const summaryItem = document.createElement('div');
            summaryItem.className = 'summary-item';

            const summaryLabel = document.createElement('div');
            summaryLabel.className = 'summary-label';
            summaryLabel.textContent = label;

            const summaryValue = document.createElement('div');
            summaryValue.className = 'summary-value';
            summaryValue.textContent = value;

            summaryItem.appendChild(summaryLabel);
            summaryItem.appendChild(summaryValue);
            summaryContainer.appendChild(summaryItem);
        }
    }
}

// 页面加载完成后初始化表单处理器
document.addEventListener('DOMContentLoaded', () => {
    const multiForm = new MultiFormHandler('multi-page-form', 5);
});